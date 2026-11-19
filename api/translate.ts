import { TranslateRequestSchema } from '../shared/contracts.js';
import { readEnv } from './_lib/env.js';
import { ApiError, clientIp, handler, json, parseBody } from './_lib/http.js';
import { translationProvider } from './_lib/providers/index.js';
import { enforceRateLimit } from './_lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 'POST uniquement');
  const rl = await enforceRateLimit(env, 'translate', clientIp(req), 40, 60);
  const body = await parseBody(req, TranslateRequestSchema);

  if (body.source && body.source === body.target) {
    return json({ translations: body.texts, provider: 'none' }, { headers: rl });
  }
  const provider = translationProvider(env);
  if (!provider) return json({ translations: body.texts, provider: 'none' }, { headers: rl });

  try {
    const result = await provider.translate(body, AbortSignal.timeout(12_000));
    return json(result, { headers: rl });
  } catch (err) {
    console.error('[translate] failed', err instanceof Error ? err.message : err);
    throw new ApiError('PROVIDER_ERROR', 'Traduction indisponible pour le moment', rl);
  }
});

export const POST = run;
export const OPTIONS = run;
export const GET = run;
