import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '../api/health';
import { POST as translate } from '../api/translate';
import { OPTIONS as ttsOptions, POST as tts } from '../api/tts';
import { buildSsml } from '../api/_lib/providers/azureTts';
import { charsToWords } from '../api/_lib/providers/elevenlabsTts';
import { createMemoryLimiter } from '../api/_lib/ratelimit';

let ip = 0;
const req = (path: string, init: { method?: string; body?: unknown; origin?: string; headers?: Record<string, string> } = {}) =>
  new Request(`https://lumen.test${path}`, {
    method: init.method ?? 'POST',
    headers: {
      host: 'lumen.test',
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${++ip}`,
      ...(init.origin ? { origin: init.origin } : {}),
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) } : {}),
  });

afterEach(() => vi.unstubAllEnvs());

describe('api/health', () => {
  it('expose les providers effectifs sans secret', async () => {
    vi.stubEnv('TTS_PROVIDER', 'azure'); // sans clé → webspeech
    const res = await health(req('/api/health', { method: 'GET' }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', tts: 'webspeech', translation: 'none', rateLimit: 'memory' });
  });
});

describe('ElevenLabs : moteur au choix et plafond mensuel', () => {
  const elevenOk = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ audio_base64: 'AAAA', alignment: { characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [0.1] } }), { status: 200 }),
    );

  it('respecte le moteur demandé et coupe ElevenLabs au-delà du plafond', async () => {
    vi.stubEnv('TTS_PROVIDER', 'azure');
    vi.stubEnv('ELEVENLABS_API_KEY', 'k');
    vi.stubEnv('ELEVENLABS_MONTHLY_CHAR_LIMIT', '30');
    const f = elevenOk();
    const body = { text: 'Bonjour à tous ici', lang: 'fr', gender: 'female', engine: 'elevenlabs' }; // 18 caractères
    const ok = await tts(req('/api/tts', { body }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { provider: string }).provider).toBe('elevenlabs');
    const h = (await (await health(req('/api/health', { method: 'GET' }))).json()) as { engines: string[]; premiumRemaining: number };
    expect(h.engines).toEqual(['elevenlabs']);
    expect(h.premiumRemaining).toBe(12);
    // 18 + 18 > 30 : ElevenLabs est retiré, pas d'Azure configuré → 503 (repli navigateur côté client).
    const blocked = await tts(req('/api/tts', { body }));
    expect(blocked.status).toBe(503);
    expect(f).toHaveBeenCalledTimes(1);
    f.mockRestore();
  });
});

describe('ElevenLabs : voix refusée', () => {
  it('réessaie avec la voix standard si la voix configurée est refusée', async () => {
    const { ElevenLabsTtsProvider } = await import('../api/_lib/providers/elevenlabsTts');
    const ok = JSON.stringify({ audio_base64: 'AAAA', alignment: null });
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 402 }))
      .mockResolvedValueOnce(new Response(ok, { status: 200 }));
    const p = new ElevenLabsTtsProvider('k', 'eleven_multilingual_v2', { male: 'communautaire', female: 'communautaire' });
    const r = await p.synthesize({ text: 'Salut', lang: 'fr', gender: 'female', speed: 1, pitch: 0 });
    expect(r.provider).toBe('elevenlabs');
    expect(String(f.mock.calls[1]![0])).toContain('/pFZP5JQG7iQjIQuC4Bku/');
    f.mockRestore();
  });
});

describe('provider effectif', () => {
  it('annonce le provider de secours configuré quand le principal n’a pas de clé', async () => {
    vi.stubEnv('TTS_PROVIDER', 'azure');
    vi.stubEnv('ELEVENLABS_API_KEY', 'k');
    const body = (await (await health(req('/api/health', { method: 'GET' }))).json()) as { tts: string };
    expect(body.tts).toBe('elevenlabs');
  });
});

describe('api/tts', () => {
  it('refuse une origine non autorisée', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://lumen.app');
    vi.stubEnv('VERCEL_ENV', 'production');
    const res = await tts(req('/api/tts', { origin: 'https://evil.example', body: { text: 'hi', lang: 'en', gender: 'male' } }));
    expect(res.status).toBe(403);
  });

  it('répond au preflight pour une origine autorisée', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://lumen.app');
    const res = await ttsOptions(req('/api/tts', { method: 'OPTIONS', origin: 'https://lumen.app' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://lumen.app');
  });

  it('valide le payload (400) et la taille (413)', async () => {
    expect((await tts(req('/api/tts', { body: { text: '', lang: 'fr', gender: 'x' } }))).status).toBe(400);
    expect((await tts(req('/api/tts', { body: '{oops' }))).status).toBe(400);
    expect((await tts(req('/api/tts', { body: { text: 'a'.repeat(70_000), lang: 'fr', gender: 'male' } }))).status).toBe(413);
  });

  it('renvoie 503 (fallback Web Speech) quand aucun provider serveur', async () => {
    const res = await tts(req('/api/tts', { body: { text: 'Bonjour', lang: 'fr', gender: 'female' } }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('rate limite par IP (429 + Retry-After)', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    let last: Response | null = null;
    for (let i = 0; i < 61; i++) last = await tts(req('/api/tts', { headers, body: { text: 'x', lang: 'fr', gender: 'male' } }));
    expect(last?.status).toBe(429);
    expect(last?.headers.get('retry-after')).toBeTruthy();
  });
});

describe('rate limit Upstash', () => {
  it('ne bloque pas le service si Upstash refuse le token', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mauvais');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'WRONGPASS invalid or missing auth token' }), { status: 401 }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await translate(req('/api/translate', { body: { texts: ['Bonjour'], target: 'en' } }));
    expect(res.status).toBe(200);
    fetchMock.mockRestore();
    err.mockRestore();
  });
});

describe('api/translate', () => {
  it('passthrough quand la traduction est désactivée', async () => {
    const res = await translate(req('/api/translate', { body: { texts: ['Bonjour'], target: 'en' } }));
    expect(await res.json()).toEqual({ translations: ['Bonjour'], provider: 'none' });
  });

  it('appelle DeepL avec la bonne langue cible', async () => {
    vi.stubEnv('TRANSLATION_PROVIDER', 'deepl');
    vi.stubEnv('DEEPL_API_KEY', 'k:fx');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: 'Hello', detected_source_language: 'FR' }] }), { status: 200 }),
    );
    const res = await translate(req('/api/translate', { body: { texts: ['Bonjour'], target: 'en' } }));
    expect(await res.json()).toEqual({ translations: ['Hello'], detectedSource: 'fr', provider: 'deepl' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api-free.deepl.com/v2/translate');
    expect(JSON.parse(String(init?.body))).toMatchObject({ target_lang: 'EN-US' });
    fetchMock.mockRestore();
  });
});

describe('ElevenLabs', () => {
  it('envoie la voix de conteur, les réglages narration et le contexte', async () => {
    const { ElevenLabsTtsProvider } = await import('../api/_lib/providers/elevenlabsTts');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ audio_base64: 'AAAA', alignment: { characters: [...'Bonjour'], character_start_times_seconds: [0, 0, 0, 0, 0, 0, 0], character_end_times_seconds: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5] } }), { status: 200 }),
    );
    const p = new ElevenLabsTtsProvider('k', 'eleven_multilingual_v2', { male: 'JBFqnCBsd6RMkjVDRZzb', female: 'f' });
    const r = await p.synthesize({ text: 'Bonjour', lang: 'fr', gender: 'male', speed: 1, pitch: 0, context: { previous: 'Avant.', next: 'Après.' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/JBFqnCBsd6RMkjVDRZzb/with-timestamps');
    expect(JSON.parse(String(init?.body))).toMatchObject({ previous_text: 'Avant.', next_text: 'Après.', voice_settings: { use_speaker_boost: true } });
    expect(r.wordBoundaries[0]).toMatchObject({ word: 'Bonjour', charStart: 0 });
    fetchMock.mockRestore();
  });
});

describe('providers', () => {
  it('construit un SSML échappé avec prosodie', () => {
    const ssml = buildSsml({ text: 'Tom & <Jerry>', lang: 'fr', gender: 'male', speed: 1.25, pitch: -4 });
    expect(ssml).toContain('fr-FR-RemyMultilingualNeural');
    expect(buildSsml({ text: 'x', lang: 'pl', gender: 'female', speed: 1, pitch: 0 })).toContain('pl-PL-ZofiaNeural');
    expect(buildSsml({ text: 'x', lang: 'fr', gender: 'male', speed: 1, pitch: 0 }, 'fr-FR-HenriNeural')).toContain('fr-FR-HenriNeural');
    expect(ssml).toContain('Tom &amp; &lt;Jerry&gt;');
    expect(ssml).toContain('rate="+25%" pitch="-4st"');
  });

  it('regroupe l’alignement ElevenLabs en mots', () => {
    const chars = [...'Hi you'];
    const words = charsToWords({
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => i * 0.1),
      character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1),
    });
    expect(words.map((w) => w.word)).toEqual(['Hi', 'you']);
    expect(words[1]!.startMs).toBeCloseTo(300);
  });

  it('limiteur mémoire à fenêtre glissante', async () => {
    let t = 0;
    const l = createMemoryLimiter(2, 1000, () => t);
    expect((await l.limit('a')).success).toBe(true);
    expect((await l.limit('a')).success).toBe(true);
    expect((await l.limit('a')).success).toBe(false);
    t = 1001;
    expect((await l.limit('a')).success).toBe(true);
  });
});
