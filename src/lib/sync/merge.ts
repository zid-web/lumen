import type { SupportedLang, VoiceGender } from '@shared/langs';
import type { PitchLevel, TtsEngine } from '../tts/types';

export interface ReadingPosition {
  chapter: number;
  paragraph: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapter: number;
  paragraph: number;
  /** Début du paragraphe marqué, pour la liste. */
  excerpt: string;
  createdAt: number;
  updatedAt: number;
  /** Suppression propagée aux autres appareils (pierre tombale). */
  deleted?: true;
}

export interface SyncedPrefs {
  gender: VoiceGender;
  lang: SupportedLang;
  speed: number;
  pitchLevel: PitchLevel;
  translate: boolean;
  showOriginal: boolean;
  fontScale: number;
  autoScroll: boolean;
  engine: TtsEngine;
  /** Voix Gemini choisie dans la bibliothèque (null = voix par défaut selon Femme/Homme). */
  geminiVoice?: string | null;
}

export interface SyncState {
  v: 1;
  prefs: SyncedPrefs;
  prefsUpdatedAt: number;
  positions: Record<string, ReadingPosition>;
  bookmarks: Bookmark[];
  /** Livres supprimés : id → date de suppression. */
  deletedBooks: Record<string, number>;
  /** Livres importés présents dans le coffre (les exemples ne sont pas synchronisés). */
  books: { id: string; updatedAt: number; title?: string }[];
  /** Livre listé mais introuvable dans le coffre : id → date du constat (réparation automatique). */
  missingBooks?: Record<string, number>;
  /** Livre renvoyé dans le coffre par l'appareil qui le possède : id → date. */
  restoredBooks?: Record<string, number>;
}

const TOMBSTONE_TTL = 90 * 24 * 3600 * 1000;

/** Fusion « dernier qui écrit gagne », élément par élément. Commutative et idempotente. */
export function mergeStates(a: SyncState, b: SyncState, now = Date.now()): SyncState {
  const prefsFromB = b.prefsUpdatedAt > a.prefsUpdatedAt;

  const deletedBooks: Record<string, number> = {};
  for (const src of [a.deletedBooks, b.deletedBooks]) {
    for (const [id, at] of Object.entries(src)) {
      if (now - at < TOMBSTONE_TTL) deletedBooks[id] = Math.max(deletedBooks[id] ?? 0, at);
    }
  }

  const positions: Record<string, ReadingPosition> = {};
  for (const src of [a.positions, b.positions]) {
    for (const [id, p] of Object.entries(src)) {
      if (deletedBooks[id] !== undefined && deletedBooks[id] >= p.updatedAt) continue;
      const cur = positions[id];
      if (!cur || p.updatedAt > cur.updatedAt) positions[id] = p;
    }
  }

  const bm = new Map<string, Bookmark>();
  for (const x of [...a.bookmarks, ...b.bookmarks]) {
    const cur = bm.get(x.id);
    if (!cur || x.updatedAt > cur.updatedAt) bm.set(x.id, x);
  }
  const bookmarks = [...bm.values()]
    .map((x): Bookmark => (deletedBooks[x.bookId] !== undefined && !x.deleted ? { ...x, deleted: true, updatedAt: deletedBooks[x.bookId] ?? x.updatedAt } : x))
    .filter((x) => !(x.deleted && now - x.updatedAt > TOMBSTONE_TTL))
    .sort((x, y) => x.createdAt - y.createdAt);

  const books = new Map<string, number>();
  const titles = new Map<string, string>();
  for (const x of [...a.books, ...b.books]) {
    if (deletedBooks[x.id] !== undefined && deletedBooks[x.id]! >= x.updatedAt) continue;
    books.set(x.id, Math.max(books.get(x.id) ?? 0, x.updatedAt));
    if (x.title) titles.set(x.id, x.title);
  }
  const maxMap = (x: Record<string, number> = {}, y: Record<string, number> = {}) => {
    const out: Record<string, number> = {};
    for (const src of [x, y]) for (const [k, v] of Object.entries(src)) if (books.has(k)) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  };

  return {
    v: 1,
    prefs: prefsFromB ? b.prefs : a.prefs,
    prefsUpdatedAt: Math.max(a.prefsUpdatedAt, b.prefsUpdatedAt),
    positions,
    bookmarks,
    deletedBooks,
    books: [...books]
      .map(([id, updatedAt]) => ({ id, updatedAt, ...(titles.has(id) ? { title: titles.get(id)! } : {}) }))
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
    missingBooks: maxMap(a.missingBooks, b.missingBooks),
    restoredBooks: maxMap(a.restoredBooks, b.restoredBooks),
  };
}
