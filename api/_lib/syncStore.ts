import type { SyncRecord } from '../../shared/contracts.js';
import type { Env } from './env.js';

/** Stockage des blobs chiffrés de synchronisation. */
export interface SyncStore {
  get(syncId: string, item: string): Promise<SyncRecord | null>;
  put(syncId: string, item: string, record: SyncRecord): Promise<void>;
  delete(syncId: string, item: string): Promise<void>;
}

/** Les données inactives expirent après 180 jours (TTL renouvelé à chaque écriture). */
export const SYNC_TTL_SECONDS = 180 * 24 * 3600;
const key = (syncId: string, item: string) => `lumen:sync:${syncId}:${item}`;

let cached: SyncStore | null = null;

export async function getSyncStore(env: Env): Promise<SyncStore | null> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (cached) return cached;
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, automaticDeserialization: false });
  cached = {
    async get(syncId, item) {
      const raw = await redis.get<string>(key(syncId, item));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SyncRecord;
      return parsed;
    },
    async put(syncId, item, record) {
      await redis.set(key(syncId, item), JSON.stringify(record), { ex: SYNC_TTL_SECONDS });
    },
    async delete(syncId, item) {
      await redis.del(key(syncId, item));
    },
  };
  return cached;
}

/** Implémentation mémoire (tests). */
export function createMemorySyncStore(): SyncStore {
  const m = new Map<string, SyncRecord>();
  return {
    async get(s, i) {
      return m.get(key(s, i)) ?? null;
    },
    async put(s, i, r) {
      m.set(key(s, i), r);
    },
    async delete(s, i) {
      m.delete(key(s, i));
    },
  };
}
