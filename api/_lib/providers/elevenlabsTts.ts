import { z } from 'zod';
import { alignWords, type TtsRequest, type TtsResponse } from '../../../shared/contracts.js';
import { ProviderError, type ServerTtsProvider } from './types.js';

const AlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

const ResponseSchema = z.object({
  audio_base64: z.string(),
  alignment: AlignmentSchema.nullable().optional(),
});

/** Regroupe l'alignement caractère par caractère en mots. */
export function charsToWords(a: z.infer<typeof AlignmentSchema>): { word: string; startMs: number; endMs: number }[] {
  const words: { word: string; startMs: number; endMs: number }[] = [];
  let buf = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    if (buf.trim()) words.push({ word: buf, startMs: start * 1000, endMs: end * 1000 });
    buf = '';
  };
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) return flush();
    if (!buf) start = a.character_start_times_seconds[i] ?? end;
    buf += ch;
    end = a.character_end_times_seconds[i] ?? start;
  });
  flush();
  return words;
}

export class ElevenLabsTtsProvider implements ServerTtsProvider {
  readonly id = 'elevenlabs' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly voices: { male: string; female: string },
  ) {}

  async synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResponse> {
    const voiceId = this.voices[req.gender];
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        model_id: this.model,
        language_code: req.lang,
        // ElevenLabs accepte 0.7..1.2 ; au-delà, le client applique playbackRate.
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.min(1.2, Math.max(0.7, req.speed)) },
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new ProviderError('elevenlabs', `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const data = ResponseSchema.parse(await res.json());
    const words = data.alignment ? charsToWords(data.alignment) : [];
    const last = words.at(-1);
    return {
      audioBase64: data.audio_base64,
      mime: 'audio/mpeg',
      wordBoundaries: alignWords(req.text, words),
      durationMs: last ? Math.round(last.endMs) : 0,
      provider: 'elevenlabs',
    };
  }
}
