import type { Env } from './env.js';

/**
 * Compteur mensuel de caractères ElevenLabs (plafond de sécurité anti-facture).
 * Upstash si configuré (partagé entre instances), sinon mémoire (best effort).
 */
export interface CharQuota {
  used(): Promise<number>;
  add(n: number): Promise<void>;
}

const month = () => new Date().toISOString().slice(0, 7);
const mem = new Map<string, number>();

export async function elevenLabsQuota(env: Env): Promise<CharQuota> {
  const key = `lumen:quota:elevenlabs:${month()}`;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
      return {
        async used() {
          return Number((await redis.get<number>(key)) ?? 0);
        },
        async add(n) {
          await redis.incrby(key, n);
          await redis.expire(key, 40 * 24 * 3600);
        },
      };
    } catch (err) {
      console.error('[quota] Upstash indisponible, compteur mémoire', err instanceof Error ? err.message : err);
    }
  }
  return {
    async used() {
      return mem.get(key) ?? 0;
    },
    async add(n) {
      mem.set(key, (mem.get(key) ?? 0) + n);
    },
  };
}
