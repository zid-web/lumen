import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeAudio, encodeMp3, estimateBoundaries, GeminiTtsProvider } from '../api/_lib/providers/geminiTts';
import { GET as health } from '../api/health';
import { POST as tts } from '../api/tts';

function wav(samples: Int16Array, rate = 24000): Buffer {
  const data = Buffer.from(samples.buffer);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const tone = (n: number) => Int16Array.from({ length: n }, (_, i) => Math.round(Math.sin(i / 8) * 6000));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Gemini : audio', () => {
  it('lit le WAV et le PCM brut', () => {
    const s = tone(2400);
    const a = decodeAudio(wav(s, 24000), 'audio/wav');
    expect(a).toMatchObject({ sampleRate: 24000, channels: 1 });
    expect(a.samples.length).toBe(2400);
    const b = decodeAudio(Buffer.from(s.buffer), 'audio/L16;codec=pcm;rate=16000');
    expect(b.sampleRate).toBe(16000);
    expect(b.samples.length).toBe(2400);
  });

  it('encode en MP3 bien plus léger que le WAV', () => {
    const pcm = { samples: tone(24000 * 3), sampleRate: 24000, channels: 1 };
    const mp3 = encodeMp3(pcm);
    expect(mp3.length).toBeGreaterThan(1000);
    expect(mp3.length).toBeLessThan(pcm.samples.length * 2 * 0.2);
  });

  it('estime des positions de mots croissantes qui couvrent la durée', () => {
    const b = estimateBoundaries('Bonjour, le monde. Fin', 3000);
    expect(b.map((x) => x.word)).toEqual(['Bonjour', 'le', 'monde', 'Fin']);
    for (let i = 1; i < b.length; i++) expect(b[i]!.startMs).toBeGreaterThanOrEqual(b[i - 1]!.endMs);
    expect(b.at(-1)!.endMs).toBeLessThanOrEqual(3000);
    expect(b[1]!.charStart).toBe(9);
  });
});

describe('Gemini : fournisseur', () => {
  const okResponse = (mime: string, data: Buffer) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: data.toString('base64') } }] } }] }), { status: 200 });

  it('envoie le texte, la voix, et renvoie un MP3 avec durée et mots', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('audio/wav', wav(tone(48000))));
    const p = new GeminiTtsProvider('k', 'gemini-3.8-flash-tts', { male: 'Charon', female: 'Aoede' });
    const r = await p.synthesize({ text: 'Il était une fois.', lang: 'fr', gender: 'female', speed: 1, pitch: 0 });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toContain('/models/gemini-3.8-flash-tts:generateContent');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(body.contents[0].parts[0].text).toBe('Il était une fois.');
    expect(body.contents[0].parts[0].speech_metadata).toBeUndefined();
    expect(r).toMatchObject({ provider: 'gemini', mime: 'audio/mpeg', durationMs: 2000 });
    expect(r.wordBoundaries.map((w) => w.word)).toEqual(['Il', 'était', 'une', 'fois']);
  });

  it('transmet la consigne de narration à part et réessaie si la voix est inconnue', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":{"message":"Invalid voice name"}}', { status: 400 }))
      .mockResolvedValueOnce(okResponse('audio/wav', wav(tone(24000))));
    const p = new GeminiTtsProvider('k', 'gemini-3.8-flash-tts', { male: 'Inconnue', female: 'Inconnue' }, 'Warm narrator');
    const r = await p.synthesize({ text: 'Salut.', lang: 'fr', gender: 'male', speed: 1, pitch: 0 });
    expect(r.provider).toBe('gemini');
    const first = JSON.parse(String(f.mock.calls[0]![1]?.body));
    const second = JSON.parse(String(f.mock.calls[1]![1]?.body));
    expect(first.contents[0].parts[0].speech_metadata).toEqual({ style: 'Warm narrator' });
    expect(second.generationConfig.speechConfig).toBeUndefined();
  });

  it('bascule sur le moteur suivant si Gemini échoue, et respecte le plafond', async () => {
    vi.stubEnv('TTS_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'g');
    vi.stubEnv('ELEVENLABS_API_KEY', 'e');
    vi.stubEnv('GEMINI_MONTHLY_CHAR_LIMIT', '25');
    const eleven = new Response(JSON.stringify({ audio_base64: 'AAAA', alignment: null }), { status: 200 });
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (u) => (String(u).includes('generativelanguage') ? okResponse('audio/wav', wav(tone(24000))) : eleven.clone()));
    const req = (text: string) =>
      new Request('https://lumen.test/api/tts', {
        method: 'POST',
        headers: { host: 'lumen.test', 'content-type': 'application/json', 'x-forwarded-for': `10.9.9.${text.length}` },
        body: JSON.stringify({ text, lang: 'fr', gender: 'male' }),
      });
    const h = (await (await health(new Request('https://lumen.test/api/health', { headers: { host: 'lumen.test' } }))).json()) as { engines: string[]; tts: string };
    expect(h.engines.slice(0, 2)).toEqual(['gemini', 'elevenlabs']);
    expect(h.tts).toBe('gemini');
    const first = (await (await tts(req('Bonjour à tous ici'))).json()) as { provider: string }; // 18 caractères
    expect(first.provider).toBe('gemini');
    const second = (await (await tts(req('Encore un texte'))).json()) as { provider: string }; // 18 + 15 > 25
    expect(second.provider).toBe('elevenlabs');
    expect(f.mock.calls.filter(([u]) => String(u).includes('generativelanguage'))).toHaveLength(1);
  });
});
