import { Mp3Encoder } from '@breezystack/lamejs';
import { z } from 'zod';
import type { TtsRequest, TtsResponse, WordBoundary } from '../../../shared/contracts.js';
import { ProviderError, type ServerTtsProvider } from './types.js';

/**
 * Google Gemini Flash TTS (API Gemini, REST `generateContent` avec sortie audio).
 * L'audio renvoyé (WAV ou PCM 16 bits) est réencodé en MP3 : un WAV de 2 minutes
 * dépasserait la taille maximale d'une réponse Vercel.
 * Gemini ne fournit pas la position des mots : elle est estimée (voir estimateBoundaries).
 */
const ResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ inlineData: z.object({ mimeType: z.string(), data: z.string() }).optional() }).passthrough()).optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
});

export interface Pcm {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

/** Lit un WAV (en-tête RIFF) ou du PCM 16 bits brut (« audio/L16;rate=24000 »). */
export function decodeAudio(bytes: Buffer, mimeType: string): Pcm {
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
    let off = 12;
    let sampleRate = 24000;
    let channels = 1;
    let bits = 16;
    while (off + 8 <= bytes.length) {
      const id = bytes.toString('ascii', off, off + 4);
      const size = bytes.readUInt32LE(off + 4);
      const body = off + 8;
      if (id === 'fmt ') {
        channels = bytes.readUInt16LE(body + 2);
        sampleRate = bytes.readUInt32LE(body + 4);
        bits = bytes.readUInt16LE(body + 14);
      } else if (id === 'data') {
        if (bits !== 16) throw new ProviderError('gemini', `WAV ${bits} bits non pris en charge`, false);
        const end = Math.min(bytes.length, body + size);
        const data = bytes.subarray(body, end - ((end - body) % 2));
        return { samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)), sampleRate, channels };
      }
      off = body + size + (size % 2);
    }
    throw new ProviderError('gemini', 'WAV sans données audio', false);
  }
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] ?? 24000);
  const even = bytes.subarray(0, bytes.length - (bytes.length % 2));
  return { samples: new Int16Array(even.buffer.slice(even.byteOffset, even.byteOffset + even.length)), sampleRate: rate, channels: 1 };
}

export function encodeMp3({ samples, sampleRate, channels }: Pcm, kbps = 64): Buffer {
  const mono = channels === 1 ? samples : Int16Array.from({ length: Math.floor(samples.length / channels) }, (_, i) => samples[i * channels] ?? 0);
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < mono.length; i += 1152) parts.push(enc.encodeBuffer(mono.subarray(i, i + 1152)));
  parts.push(enc.flush());
  return Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.length)));
}

/**
 * Estime la position des mots : la durée est répartie au prorata de la longueur
 * des mots, avec un temps supplémentaire après la ponctuation (pauses).
 */
export function estimateBoundaries(text: string, durationMs: number): WordBoundary[] {
  const words = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
  if (!words.length || durationMs <= 0) return [];
  const weights = words.map((m, i) => {
    const next = words[i + 1]?.index ?? text.length;
    const gap = text.slice((m.index ?? 0) + m[0].length, next);
    const pause = /[.!?…]/.test(gap) ? 6 : /[,;:—–]/.test(gap) ? 3 : 0;
    return { w: m[0].length + 1.5, pause };
  });
  const total = weights.reduce((n, x) => n + x.w + x.pause, 0);
  const unit = durationMs / total;
  let t = 0;
  return words.map((m, i) => {
    const { w, pause } = weights[i]!;
    const start = t;
    t += w * unit;
    const b = { word: m[0], startMs: Math.round(start), endMs: Math.round(t), charStart: m.index ?? 0, charLength: m[0].length };
    t += pause * unit;
    return b;
  });
}

export class GeminiTtsProvider implements ServerTtsProvider {
  readonly id = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly voices: { male: string; female: string },
    private readonly style = '',
  ) {}

  private async call(req: TtsRequest, voiceName: string | null, signal?: AbortSignal): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    return fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Gemini 3.8 lit le texte mot pour mot : la consigne de narration va dans speech_metadata.
        contents: [{ role: 'user', parts: [{ text: req.text, ...(this.style ? { speech_metadata: { style: this.style } } : {}) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          ...(voiceName ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } : {}),
        },
      }),
      ...(signal ? { signal } : {}),
    });
  }

  async synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResponse> {
    const wanted = req.voice ?? this.voices[req.gender];
    let voiceFallback = false;
    let res = await this.call(req, wanted, signal);
    if (res.status === 400 || res.status === 404) {
      const detail = await res.text().catch(() => '');
      // Voix inconnue de ce modèle : nouvel essai avec la voix par défaut de Gemini (signalé au client).
      if (/voice/i.test(detail)) {
        console.warn(`[gemini] voix ${wanted} refusée, voix par défaut : ${detail.slice(0, 200)}`);
        voiceFallback = true;
        res = await this.call(req, null, signal);
      } else throw new ProviderError('gemini', `HTTP ${res.status} ${detail.slice(0, 300)}`, false, res.status);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new ProviderError('gemini', `HTTP ${res.status} ${detail}`, res.status >= 500 || res.status === 429, res.status);
    }
    const data = ResponseSchema.parse(await res.json());
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) throw new ProviderError('gemini', `réponse sans audio (${data.candidates?.[0]?.finishReason ?? 'inconnu'})`);

    const pcm = decodeAudio(Buffer.from(part.inlineData.data, 'base64'), part.inlineData.mimeType);
    const durationMs = Math.round((pcm.samples.length / pcm.channels / pcm.sampleRate) * 1000);
    return {
      audioBase64: encodeMp3(pcm).toString('base64'),
      mime: 'audio/mpeg',
      wordBoundaries: estimateBoundaries(req.text, durationMs),
      durationMs,
      provider: 'gemini',
      ...(voiceFallback ? { voiceFallback: true } : {}),
    };
  }
}
