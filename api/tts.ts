import { TtsRequestSchema } from '../shared/contracts.js';
import { readEnv } from './_lib/env.js';
import { ApiError, clientIp, handler, json, parseBody } from './_lib/http.js';
import { ttsChain } from './_lib/providers/index.js';
import { ProviderError } from './_lib/providers/types.js';
import { engineQuota, monthlyLimit, type CharQuota } from './_lib/quota.js';
import { enforceRateLimit } from './_lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 'POST uniquement');
  const rl = await enforceRateLimit(env, 'tts', clientIp(req), 60, 60);
  const body = await parseBody(req, TtsRequestSchema);

  // Plafonds mensuels des moteurs payants : au-delà, le moteur est retiré de la chaîne (repli Azure / Web Speech).
  const quotas: Partial<Record<'elevenlabs' | 'gemini', CharQuota>> = {};
  const quotaOf = async (engine: 'elevenlabs' | 'gemini') => (quotas[engine] ??= await engineQuota(env, engine));
  const overBudget = async (engine: 'elevenlabs' | 'gemini', n: number) => {
    try {
      return (await (await quotaOf(engine)).used()) + n > monthlyLimit(env, engine);
    } catch {
      return true; // compteur illisible : par prudence, pas de moteur payant
    }
  };
  const chain = [];
  for (const p of ttsChain(env, body.engine ?? 'auto')) {
    if (p.id !== 'azure' && (await overBudget(p.id, body.text.length))) continue;
    chain.push(p);
  }
  if (chain.length === 0) throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse serveur désactivée, utilisez Web Speech', rl);

  let lastError: unknown;
  for (const provider of chain) {
    try {
      const result = await provider.synthesize(body, AbortSignal.timeout(25_000));
      if (provider.id !== 'azure') await (await quotaOf(provider.id)).add(body.text.length).catch(() => {});
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
