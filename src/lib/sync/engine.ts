import { db, type Book } from '../db';
import { toMeta, useLibrary } from '@/store/library';
import { pickPrefs, useSettings } from '@/store/settings';
import { useSync } from '@/store/sync';
import { decryptJson, deriveSyncKeys, encryptJson, type SyncKeys } from './crypto';
import { mergeStates, type SyncState } from './merge';

export class SyncError extends Error {}

async function api(keys: SyncKeys, method: 'GET' | 'PUT' | 'DELETE', item: string, body?: { data: string; updatedAt: number }) {
  const url = method === 'PUT' ? '/api/sync' : `/api/sync?item=${encodeURIComponent(item)}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-Sync-Id': keys.id, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ item, ...body }) } : {}),
  });
  if (method === 'GET' && res.status === 404) return null;
  if (!res.ok) {
    if (res.status === 503) throw new SyncError('Synchronisation indisponible sur ce serveur.');
    if (res.status === 413) throw new SyncError('Un livre est trop volumineux pour être synchronisé.');
    if (res.status === 429) throw new SyncError('Trop de synchronisations, réessayez dans une minute.');
    throw new SyncError(`Erreur de synchronisation (${res.status}).`);
  }
  return (await res.json()) as { data: string; updatedAt: number };
}

async function localState(): Promise<SyncState> {
  const s = useSettings.getState();
  const metas = await (await db()).getAll('meta');
  return {
    v: 1,
    prefs: pickPrefs(s),
    prefsUpdatedAt: s.prefsUpdatedAt,
    positions: s.positions,
    bookmarks: s.bookmarks,
    deletedBooks: s.deletedBooks,
    books: metas.filter((m) => m.source !== 'sample').map((m) => ({ id: m.id, updatedAt: m.addedAt })),
  };
}

let running: Promise<void> | null = null;

/** Synchronise avec le coffre chiffré. Sans effet si la synchro n'est pas activée. */
export function syncNow(): Promise<void> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

type Persisted = { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } };

/** Attend que l'état local soit rechargé depuis IndexedDB (sinon la fusion écraserait des données). */
function hydrated(store: Persisted): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

async function run(): Promise<void> {
  await Promise.all([hydrated(useSync), hydrated(useSettings)]);
  const { code, patch } = useSync.getState();
  if (!code || !navigator.onLine) return;
  patch({ status: 'syncing', error: null });
  try {
    const keys = await deriveSyncKeys(code);
    const remoteRec = await api(keys, 'GET', 'state');
    let remote: SyncState | null = null;
    if (remoteRec) {
      try {
        remote = await decryptJson<SyncState>(keys.key, remoteRec.data);
      } catch {
        throw new SyncError('Impossible de déchiffrer les données : vérifiez le code de synchronisation.');
      }
    }
    const local = await localState();
    const merged = remote ? mergeStates(local, remote) : local;
    const remoteBookIds = new Set((remote?.books ?? []).map((b) => b.id));
    const localBookIds = new Set(local.books.map((b) => b.id));

    // 1. Livres supprimés ailleurs → suppression locale.
    const library = useLibrary.getState();
    for (const id of Object.keys(merged.deletedBooks)) {
      if (localBookIds.has(id)) await library.removeLocal(id);
      if (remoteBookIds.has(id)) await api(keys, 'DELETE', `book:${id}`);
    }

    // 2. Nouveaux livres d'ici → envoi chiffré.
    const d = await db();
    for (const id of localBookIds) {
      if (remoteBookIds.has(id) || merged.deletedBooks[id] !== undefined) continue;
      const book = await d.get('books', id);
      if (book) await api(keys, 'PUT', `book:${id}`, { data: await encryptJson(keys.key, book), updatedAt: book.addedAt });
    }

    // 3. Livres d'ailleurs → téléchargement.
    for (const { id } of merged.books) {
      if (localBookIds.has(id) || merged.deletedBooks[id] !== undefined) continue;
      const rec = await api(keys, 'GET', `book:${id}`);
      if (!rec) continue;
      const book = await decryptJson<Book>(keys.key, rec.data);
      const tx = d.transaction(['books', 'meta'], 'readwrite');
      await tx.objectStore('books').put(book);
      await tx.objectStore('meta').put(toMeta(book));
      await tx.done;
    }
    await useLibrary.getState().load();

    // 4. État fusionné : appliqué ici, puis publié.
    useSettings.getState().replaceSynced(merged);
    await api(keys, 'PUT', 'state', { data: await encryptJson(keys.key, merged), updatedAt: Date.now() });
    patch({ status: 'idle', lastSyncAt: Date.now() });
  } catch (err) {
    patch({ status: 'error', error: err instanceof SyncError ? err.message : 'Synchronisation impossible pour le moment.' });
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Déclenche une synchro différée (après une modification locale). */
export function scheduleSync(delayMs = 4000): void {
  if (!useSync.getState().code) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

let started = false;

/** Synchro automatique : au démarrage, au retour en ligne, en quittant l'app et après chaque modification. */
export function startAutoSync(): void {
  if (started) return;
  started = true;
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void syncNow();
    else scheduleSync(500);
  });
  useSettings.subscribe((s, prev) => {
    if (s.positions !== prev.positions || s.bookmarks !== prev.bookmarks || s.prefsUpdatedAt !== prev.prefsUpdatedAt || s.deletedBooks !== prev.deletedBooks) {
      scheduleSync();
    }
  });
  useLibrary.subscribe((s, prev) => {
    if (s.books !== prev.books) scheduleSync();
  });
}
