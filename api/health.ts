import type { HealthResponse } from '../shared/contracts.js';
import { configuredEngines, effectiveTranslationProvider, effectiveTtsProvider, readEnv } from './_lib/env.js';
import { engineQuota, monthlyLimit } from './_lib/quota.js';
import { ApiError, handler, json } from './_lib/http.js';

export const config = { runtime: 'nodejs' };

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', 'GET uniquement');
  const engines = configuredEngines(env);
  const remaining: Record<string, number> = {};
  for (const e of engines) {
    if (e === 'azure') continue;
    const used = await (await engineQuota(env, e)).used().catch(() => monthlyLimit(env, e));
    remaining[e] = Math.max(0, monthlyLimit(env, e) - used);
  }
  const premiumRemaining = remaining.elevenlabs;
  const body: HealthResponse = {
    status: 'ok',
    tts: effectiveTtsProvider(env),
    translation: effectiveTranslationProvider(env),
    rateLimit: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? 'upstash' : 'memory',
    engines,
    ...(premiumRemaining !== undefined ? { premiumRemaining } : {}),
    remaining,
    sync: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    time: new Date().toISOString(),
  };
  return json(body, { headers: { 'Cache-Control': 'public, max-age=30' } });
});

export const GET = run;
export const OPTIONS = run;
export const POST = run;
