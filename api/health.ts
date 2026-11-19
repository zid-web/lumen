import type { HealthResponse } from '../shared/contracts.js';
import { effectiveTranslationProvider, effectiveTtsProvider, readEnv } from './_lib/env.js';
import { ApiError, handler, json } from './_lib/http.js';

export const config = { runtime: 'nodejs' };

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', 'GET uniquement');
  const body: HealthResponse = {
    status: 'ok',
    tts: effectiveTtsProvider(env),
    translation: effectiveTranslationProvider(env),
    rateLimit: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? 'upstash' : 'memory',
    time: new Date().toISOString(),
  };
  return json(body, { headers: { 'Cache-Control': 'public, max-age=60' } });
});

export const GET = run;
export const OPTIONS = run;
export const POST = run;
