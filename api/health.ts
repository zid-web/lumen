import type { HealthResponse } from '../shared/contracts.js';
import { azureSpeechConfigured, effectiveTranslationProvider, effectiveTtsProvider, readEnv } from './_lib/env.js';
import { elevenLabsQuota } from './_lib/quota.js';
import { ApiError, handler, json } from './_lib/http.js';

export const config = { runtime: 'nodejs' };

function ttsEngines(env: ReturnType<typeof readEnv>): ('azure' | 'elevenlabs')[] {
  const list: ('azure' | 'elevenlabs')[] = [];
  if (azureSpeechConfigured(env)) list.push('azure');
  if (env.ELEVENLABS_API_KEY) list.push('elevenlabs');
  return env.TTS_PROVIDER === 'elevenlabs' ? list.reverse() : list;
}

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', 'GET uniquement');
  const engines = ttsEngines(env);
  let premiumRemaining: number | undefined;
  if (engines.includes('elevenlabs')) {
    const used = await (await elevenLabsQuota(env)).used().catch(() => env.ELEVENLABS_MONTHLY_CHAR_LIMIT);
    premiumRemaining = Math.max(0, env.ELEVENLABS_MONTHLY_CHAR_LIMIT - used);
  }
  const body: HealthResponse = {
    status: 'ok',
    tts: effectiveTtsProvider(env),
    translation: effectiveTranslationProvider(env),
    rateLimit: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? 'upstash' : 'memory',
    engines,
    ...(premiumRemaining !== undefined ? { premiumRemaining } : {}),
    sync: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    time: new Date().toISOString(),
  };
  return json(body, { headers: { 'Cache-Control': 'public, max-age=30' } });
});

export const GET = run;
export const OPTIONS = run;
export const POST = run;
