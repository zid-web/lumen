import { TtsRequestSchema } from '../shared/contracts.js';
import { readEnv } from './_lib/env.js';
import { ApiError, clientIp, handler, json, parseBody } from './_lib/http.js';
import { ttsChain } from './_lib/providers/index.js';
import { ProviderError } from './_lib/providers/types.js';
import { elevenLabsQuota } from './_lib/quota.js';
import { enforceRateLimit } from './_lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 'POST uniquement');
  const rl = await enforceRateLimit(env, 'tts', clientIp(req), 60, 60);
  const body = await parseBody(req, TtsRequestSchema);

  const quota = await elevenLabsQuota(env);
  // Plafond mensuel : au-delà, ElevenLabs est retiré de la chaîne (repli Azure / Web Speech).
  const overBudget = async (n: number) => {
    try {
      return (await quota.used()) + n > env.ELEVENLABS_MONTHLY_CHAR_LIMIT;
    } catch {
      return true; // compteur illisible : par prudence, pas d'ElevenLabs
    }
  };
  const chain = [];
  for (const p of ttsChain(env, body.engine ?? 'auto')) {
    if (p.id === 'elevenlabs' && (await overBudget(body.text.length))) continue;
    chain.push(p);
  }
  if (chain.length === 0) throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse serveur désactivée, utilisez Web Speech', rl);

  let lastError: unknown;
  for (const provider of chain) {
    try {
      const result = await provider.synthesize(body, AbortSignal.timeout(25_000));
      if (provider.id === 'elevenlabs') await quota.add(body.text.length).catch(() => {});
      return json(result, { headers: rl });
    } catch (err) {
      lastError = err;
      console.warn(`[tts] ${provider.id} failed`, err instanceof Error ? err.message : err);
      // Requête annulée (délai dépassé) : inutile d'essayer un autre moteur. Sinon, moteur suivant.
      if (err instanceof ProviderError && err.message.includes('aborted')) break;
    }
  }
  console.error('[tts] all providers failed', lastError);
  throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse indisponible, bascule sur Web Speech', rl);
});

export const POST = run;
export const OPTIONS = run;
export const GET = run;
