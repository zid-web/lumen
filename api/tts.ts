import { TtsRequestSchema, type FallbackReason } from '../shared/contracts.js';
import { engineState, msUntilDailyReset } from './_lib/cooldown.js';
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
  const state = await engineState(env);
  const wanted = body.engine && body.engine !== 'auto' ? body.engine : null;
  let reason: FallbackReason | undefined;
  const chain = [];
  for (const p of ttsChain(env, body.engine ?? 'auto')) {
    if (p.id !== 'azure') {
      if (await overBudget(p.id, body.text.length)) {
        if (p.id === wanted || (!wanted && !reason)) reason = 'budget';
        continue;
      }
      // Moteur en pause après une limite de requêtes : on ne perd pas de temps à le réessayer.
      const paused = await state.pausedUntil(p.id).catch(() => null);
      if (paused) {
        if (p.id === wanted || (!wanted && !reason)) reason = paused.reason === 'daily_quota' ? 'daily_quota' : 'rate_limit';
        continue;
      }
    }
    chain.push(p);
  }
  if (chain.length === 0) throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse serveur désactivée, utilisez Web Speech', rl);

  let lastError: unknown;
  const started = Date.now();
  for (const [i, provider] of chain.entries()) {
    const isLast = i === chain.length - 1;
    // Gemini peut mettre longtemps sur un long passage ; on garde ~15 s pour le moteur de secours.
    const budgetMs = Math.max(5_000, (isLast ? 55_000 : 42_000) - (Date.now() - started));
    try {
      let result;
      try {
        result = await provider.synthesize(body, AbortSignal.timeout(budgetMs));
      } catch (err) {
        // Limite par minute avec un délai court : on attend et on réessaie une fois avant de basculer.
        const lim = err instanceof ProviderError ? err.limit : undefined;
        if (!lim || lim.daily || lim.retryAfterMs > 8_000 || Date.now() - started > 20_000) throw err;
        await new Promise((r) => setTimeout(r, lim.retryAfterMs + 250));
        result = await provider.synthesize(body, AbortSignal.timeout(Math.max(5_000, 42_000 - (Date.now() - started))));
      }
      if (provider.id !== 'azure') await (await quotaOf(provider.id)).add(body.text.length).catch(() => {});
      return json(reason && provider.id !== wanted ? { ...result, fallbackReason: reason } : result, { headers: rl });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tts] ${provider.id} failed`, msg);
      if (provider.id !== 'azure') {
        const lim = err instanceof ProviderError ? err.limit : undefined;
        const r: FallbackReason = lim ? (lim.daily ? 'daily_quota' : 'rate_limit') : /abort|timeout/i.test(msg) ? 'timeout' : 'error';
        if (provider.id === wanted || !reason) reason = r;
        if (lim) await state.pause(provider.id, lim.daily ? Math.max(lim.retryAfterMs, msUntilDailyReset()) : Math.min(lim.retryAfterMs, 5 * 60_000), r).catch(() => {});
        await state.recordFallback(provider.id, r, msg).catch(() => {});
      }
      // Client parti : inutile d'essayer un autre moteur.
      if (req.signal?.aborted) break;
    }
  }
  console.error('[tts] all providers failed', lastError);
  throw new ApiError('PROVIDER_UNAVAILABLE', 'Synthèse indisponible, bascule sur Web Speech', rl);
});

export const POST = run;
export const OPTIONS = run;
export const GET = run;
