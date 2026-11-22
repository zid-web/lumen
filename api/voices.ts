import { GEMINI_VOICE_CATALOG } from '../shared/geminiVoices.js';
import type { VoiceInfo } from '../shared/contracts.js';
import { readEnv } from './_lib/env.js';
import { ApiError, clientIp, handler, json } from './_lib/http.js';
import { createMemoryLimiter } from './_lib/ratelimit.js';

export const config = { runtime: 'nodejs' };

const limiter = createMemoryLimiter(30, 60_000);
let cache: { at: number; voices: VoiceInfo[] } | null = null;
const TTL = 12 * 3600 * 1000;

const catalog = (): VoiceInfo[] =>
  GEMINI_VOICE_CATALOG.map((c) => ({ id: c.name, name: c.name, description: c.description, category: c.category, pitch: c.pitch }));

/** Lecture tolérante de la bibliothèque de voix Gemini (schéma non documenté en détail). */
function mapApiVoice(raw: unknown): VoiceInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
  const id = str('voiceName') ?? str('name') ?? str('id');
  if (!id) return null;
  const name = str('displayName') ?? id.replace(/^voices\//, '');
  const description = str('description') ?? str('style');
  const category = str('category') ?? (Array.isArray(o.useCases) ? String(o.useCases[0]) : undefined);
  const pitch = str('pitch');
  return { id, name, ...(description ? { description } : {}), ...(category ? { category } : {}), ...(pitch ? { pitch } : {}) };
}

/**
 * GET /api/voices — voix Gemini : bibliothèque complète via l'API Google (mise en cache 12 h),
 * sinon la sélection intégrée. La clé API reste côté serveur.
 */
const run = handler(readEnv, async (req, { env }) => {
  if (req.method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', 'GET uniquement');
  if (!(await limiter.limit(clientIp(req))).success) throw new ApiError('RATE_LIMITED', 'Trop de requêtes');
  const headers = { 'Cache-Control': 'public, max-age=3600' };
  if (!env.GEMINI_API_KEY) return json({ voices: catalog(), source: 'catalog' }, { headers });
  if (cache && Date.now() - cache.at < TTL) return json({ voices: cache.voices, source: 'api' }, { headers });

  try {
    const all: VoiceInfo[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 30; page++) {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/voices');
      url.searchParams.set('pageSize', '500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await fetch(url, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const data = (await res.json()) as { voices?: unknown[]; nextPageToken?: string };
      for (const v of data.voices ?? []) {
        const m = mapApiVoice(v);
        if (m) all.push(m);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    if (all.length === 0) throw new Error('liste vide');
    // La sélection intégrée reste en tête, avec ses catégories en français.
    const known = new Map(catalog().map((c) => [c.name.toLowerCase(), c]));
    const merged = [...known.values(), ...all.filter((v) => !known.has(v.name.toLowerCase()))];
    cache = { at: Date.now(), voices: merged };
    return json({ voices: merged, source: 'api' }, { headers });
  } catch (err) {
    console.warn('[voices] bibliothèque Gemini indisponible, sélection intégrée', err instanceof Error ? err.message : err);
    return json({ voices: catalog(), source: 'catalog' }, { headers });
  }
});

export const GET = run;
export const OPTIONS = run;
