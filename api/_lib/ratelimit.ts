import type { Env } from './env.js';
import { ApiError } from './http.js';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export interface Limiter {
  kind: 'upstash' | 'memory';
  limit(id: string): Promise<RateLimitResult>;
}

/** Fenêtre glissante en mémoire — fallback par instance (best effort en serverless). */
export function createMemoryLimiter(max: number, windowMs: number, now: () => number = Date.now): Limiter {
  const hits = new Map<string, number[]>();
  return {
    kind: 'memory',
    async limit(id) {
      const t = now();
      const recent = (hits.get(id) ?? []).filter((ts) => t - ts < windowMs);
      const success = recent.length < max;
      if (success) recent.push(t);
      hits.set(id, recent);
      if (hits.size > 10_000) {
        // Évite une croissance illimitée sur une instance chaude.
        for (const [k, v] of hits) if (v.every((ts) => t - ts >= windowMs)) hits.delete(k);
      }
      const oldest = recent[0] ?? t;
      return { success, limit: max, remaining: Math.max(0, max - recent.length), reset: oldest + windowMs };
    },
  };
}

const cache = new Map<string, Limiter>();

export async function getLimiter(env: Env, name: string, max: number, windowSec: number): Promise<Limiter> {
  const key = `${name}:${max}:${windowSec}`;
  const existing = cache.get(key);
  if (existing) return existing;

  let limiter: Limiter;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const [{ Ratelimit }, { Redis }] = await Promise.all([import('@upstash/ratelimit'), import('@upstash/redis')]);
    const rl = new Ratelimit({
      redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: `lumen:${name}`,
      analytics: false,
    });
    limiter = {
      kind: 'upstash',
      async limit(id) {
        const r = await rl.limit(id);
        return { success: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
      },
    };
  } else {
    limiter = createMemoryLimiter(max, windowSec * 1000);
  }
  cache.set(key, limiter);
  return limiter;
}

export async function enforceRateLimit(env: Env, name: string, id: string, max: number, windowSec: number): Promise<Record<string, string>> {
  const limiter = await getLimiter(env, name, max, windowSec);
  const r = await limiter.limit(id);
  const headers = {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
  };
  if (!r.success) {
    throw new ApiError('RATE_LIMITED', 'Trop de requêtes, réessayez dans un instant', {
      ...headers,
      'Retry-After': String(Math.max(1, Math.ceil((r.reset - Date.now()) / 1000))),
    });
  }
  return headers;
}
