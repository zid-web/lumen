import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SupportedLang, WordBoundary } from '@shared/langs';
import type { TtsProviderId } from './tts/types';

export interface Chapter {
  title: string;
  paragraphs: string[];
}

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  lang: SupportedLang;
  source: 'sample' | 'txt' | 'epub' | 'pdf' | 'paste';
  chapterCount: number;
  paragraphCount: number;
  addedAt: number;
  hue: number;
}

export interface Book extends BookMeta {
  chapters: Chapter[];
}

export interface CachedAudio {
  key: string;
  blob: Blob;
  wordBoundaries: WordBoundary[];
  durationMs: number;
  provider: TtsProviderId;
  createdAt: number;
}

interface LumenDB extends DBSchema {
  kv: { key: string; value: string };
  books: { key: string; value: Book };
  meta: { key: string; value: BookMeta; indexes: { addedAt: number } };
  audio: { key: string; value: CachedAudio; indexes: { createdAt: number } };
  translations: { key: string; value: { key: string; texts: string[]; createdAt: number } };
}

let dbPromise: Promise<IDBPDatabase<LumenDB>> | null = null;

export function db(): Promise<IDBPDatabase<LumenDB>> {
  dbPromise ??= openDB<LumenDB>('lumen', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'id' }).createIndex('addedAt', 'addedAt');
      d.createObjectStore('audio', { keyPath: 'key' }).createIndex('createdAt', 'createdAt');
      d.createObjectStore('translations', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

/** Adaptateur de stockage Zustand `persist` → IndexedDB. */
export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    return (await (await db()).get('kv', name)) ?? null;
  },
  async setItem(name: string, value: string): Promise<void> {
    await (await db()).put('kv', value, name);
  },
  async removeItem(name: string): Promise<void> {
    await (await db()).delete('kv', name);
  },
};

const MAX_AUDIO_ENTRIES = 1500;

export async function getCachedAudio(key: string): Promise<CachedAudio | undefined> {
  return (await db()).get('audio', key);
}

export async function putCachedAudio(entry: CachedAudio): Promise<void> {
  const d = await db();
  await d.put('audio', entry);
  const count = await d.count('audio');
  if (count > MAX_AUDIO_ENTRIES) {
    // Éviction des plus anciennes entrées (LRU approximatif par date d'insertion).
    const tx = d.transaction('audio', 'readwrite');
    let toDelete = count - MAX_AUDIO_ENTRIES;
    let cursor = await tx.store.index('createdAt').openCursor();
    while (cursor && toDelete > 0) {
      await cursor.delete();
      toDelete--;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export async function audioCacheStats(): Promise<{ entries: number; bytes: number }> {
  const all = await (await db()).getAll('audio');
  return { entries: all.length, bytes: all.reduce((n, a) => n + a.blob.size, 0) };
}

export async function clearAudioCache(): Promise<void> {
  await (await db()).clear('audio');
}
