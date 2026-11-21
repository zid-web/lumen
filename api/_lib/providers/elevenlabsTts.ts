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

/** Modèles qui acceptent le paramètre language_code. */
export const supportsLanguageCode = (model: string) => /(turbo|flash)_v2_5|eleven_v3/.test(model);

/** Voix standard d'ElevenLabs (George, Lily), utilisables sur toutes les offres. */
const DEFAULT_VOICES = { male: 'JBFqnCBsd6RMkjVDRZzb', female: 'pFZP5JQG7iQjIQuC4Bku' } as const;

export class ElevenLabsTtsProvider implements ServerTtsProvider {
  readonly id = 'elevenlabs' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly voices: { male: string; female: string },
  ) {}

  async synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResponse> {
    try {
      return await this.synthesizeWith(req, this.voices[req.gender], signal);
    } catch (err) {
      const fallback = DEFAULT_VOICES[req.gender];
      // Voix de la bibliothèque communautaire refusée (ex. offre gratuite) : voix standard ElevenLabs.
      if (err instanceof ProviderError && err.status !== undefined && [400, 401, 402, 403, 404].includes(err.status) && this.voices[req.gender] !== fallback) {
        console.warn(`[elevenlabs] voix ${this.voices[req.gender]} refusée (${err.status}), voix standard`);
        return this.synthesizeWith(req, fallback, signal);
      }
      throw err;
    }
  }

  private async synthesizeWith(req: TtsRequest, voiceId: string, signal?: AbortSignal): Promise<TtsResponse> {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        model_id: this.model,
        // Seuls certains modèles acceptent language_code (multilingual_v2 le refuse en 400).
        ...(supportsLanguageCode(this.model) ? { language_code: req.lang } : {}),
        // ElevenLabs accepte 0.7..1.2 ; au-delà, le client applique playbackRate.
        // Réglages « livre audio » : plus d'expressivité, timbre fidèle.
        voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, req.speed)) },
        ...(req.context?.previous ? { previous_text: req.context.previous } : {}),
        ...(req.context?.next ? { next_text: req.context.next } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      // Message d'erreur ElevenLabs (sans secret) pour le diagnostic dans les logs Vercel.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new ProviderError('elevenlabs', `HTTP ${res.status} ${detail}`, res.status >= 500 || res.status === 429, res.status);
    }
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
