import { TtsRequestSchema } from '../shared/contracts.js';
import { readEnv } from './_lib/env.js';
import { ApiError, clientIp, handler, json, parseBody } from './_lib/http.js';
import { ttsChain } from './_lib/providers/index.js';
import { ProviderError } from './_lib/providers/types.js';
import { enforceRateLimit } from './_lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 'POST uniquement');
  const rl = await enforceRateLimit(env, 'tts', clientIp(req), 60, 60);
  const body = await parseBody(req, TtsRequestSchema);

  const chain = ttsChain(env);
  if (chain.length === 0) throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse serveur désactivée, utilisez Web Speech', rl);

  let lastError: unknown;
  for (const provider of chain) {
    try {
      const result = await provider.synthesize(body, AbortSignal.timeout(25_000));
      return json(result, { headers: rl });
    } catch (err) {
      lastError = err;
      console.warn(`[tts] ${provider.id} failed`, err instanceof Error ? err.message : err);
      if (err instanceof ProviderError && !err.retryable) break;
    }
  }
  console.error('[tts] all providers failed', lastError);
  throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse indisponible, bascule sur Web Speech', rl);
});

export const POST = run;
export const OPTIONS = run;
export const GET = run;
