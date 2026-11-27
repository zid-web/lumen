import type { Env } from './env.js';

/**
 * Pause d'un moteur après une limite de requêtes (Gemini 429) et dernier repli observé.
 * Upstash si configuré (partagé entre instances), sinon mémoire.
 */
export interface EngineState {
  pausedUntil(engine: string): Promise<{ until: number; reason: string } | null>;
  pause(engine: string, ms: number, reason: string): Promise<void>;
  recordFallback(engine: string, reason: string, detail: string): Promise<void>;
  lastFallback(): Promise<{ engine: string; reason: string; detail: string; at: string } | null>;
}

const mem = new Map<string, { value: string; exp: number }>();
const memGet = (k: string) => {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp < Date.now()) {
    mem.delete(k);
    return null;
  }
  return e.value;
};

export async function engineState(env: Env): Promise<EngineState> {
  let get = async (k: string): Promise<string | null> => memGet(k);
  let set = async (k: string, v: string, ms: number) => void mem.set(k, { value: v, exp: Date.now() + ms });
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, automaticDeserialization: false });
      get = async (k) => {
        try {
          return await redis.get<string>(k);
        } catch {
          return memGet(k);
        }
      };
      set = async (k, v, ms) => {
        mem.set(k, { value: v, exp: Date.now() + ms });
        await redis.set(k, v, { px: Math.max(1000, Math.round(ms)) }).catch(() => {});
      };
    } catch {
      /* mémoire */
    }
  }
  const parse = <T>(s: string | null): T | null => {
    try {
      return s ? (JSON.parse(s) as T) : null;
    } catch {
      return null;
    }
  };
  return {
    async pausedUntil(engine) {
      const v = parse<{ until: number; reason: string }>(await get(`lumen:pause:${engine}`));
      return v && v.until > Date.now() ? v : null;
    },
    async pause(engine, ms, reason) {
      await set(`lumen:pause:${engine}`, JSON.stringify({ until: Date.now() + ms, reason }), ms);
    },
    async recordFallback(engine, reason, detail) {
      await set('lumen:tts:lastFallback', JSON.stringify({ engine, reason, detail: detail.replace(/\d{6,}/g, '…').replace(/(key|token)[=:]\S+/gi, '$1=…').slice(0, 300), at: new Date().toISOString() }), 7 * 24 * 3600_000);
    },
    async lastFallback() {
      return parse(await get('lumen:tts:lastFallback'));
    },
  };
}

/** Prochaine remise à zéro des quotas journaliers Gemini (minuit, heure du Pacifique ≈ 08:00 UTC). */
export function msUntilDailyReset(now = Date.now()): number {
  const d = new Date(now);
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0);
  return (reset > now ? reset : reset + 24 * 3600_000) - now;
}

/** Tests : efface l'état mémoire. */
export const resetEngineStateForTests = () => mem.clear();
