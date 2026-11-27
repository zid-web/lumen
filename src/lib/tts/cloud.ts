import type { WordBoundary } from '@shared/langs';
import { getCachedAudio, putCachedAudio } from '../db';
import { sha256 } from '../hash';
import type { TtsProvider, TtsProviderId, TtsSynthesisRequest, TtsSynthesisResult } from './types';

export class TtsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ApiTtsResponse {
  audioBase64: string;
  mime: string;
  wordBoundaries: WordBoundary[];
  durationMs: number;
  provider: TtsProviderId;
  voiceFallback?: boolean;
  fallbackReason?: TtsSynthesisResult['fallbackReason'];
}

/** Garde de forme légère (évite d'embarquer zod dans le bundle de la landing). */
function isTtsResponse(v: unknown): v is ApiTtsResponse {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.audioBase64 === 'string' && typeof o.mime === 'string' && Array.isArray(o.wordBoundaries) && typeof o.provider === 'string';
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function audioCacheKey(req: TtsSynthesisRequest, provider: TtsProviderId): Promise<string> {
  return sha256(['v4', req.engine ?? 'auto', req.voice ?? '', provider, req.lang, req.gender, req.speed.toFixed(2), req.pitch, req.text].join('|'));
}

/**
 * Provider serveur (Azure Neural / ElevenLabs) via `/api/tts`.
 * Le choix effectif est fait côté serveur par variable d'env ; `id` reflète /api/health.
 * Cache IndexedDB : clé = hash(texte + voix + langue + vitesse + hauteur + provider).
 */
export class CloudTtsProvider implements TtsProvider {
  constructor(
    readonly id: Exclude<TtsProviderId, 'webspeech'>,
    private readonly endpoint = '/api/tts',
  ) {}

  async isAvailable(): Promise<boolean> {
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  async lookup(req: TtsSynthesisRequest): Promise<TtsSynthesisResult | null> {
    const hit = await getCachedAudio(await audioCacheKey(req, this.id)).catch(() => undefined);
    if (!hit) return null;
    return {
      audioUrl: URL.createObjectURL(hit.blob),
      wordBoundaries: hit.wordBoundaries,
      durationMs: hit.durationMs,
      provider: hit.provider,
      cached: true,
    };
  }

  async synthesize(req: TtsSynthesisRequest, signal?: AbortSignal): Promise<TtsSynthesisResult> {
    const cached = await this.lookup(req);
    if (cached) return cached;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      let code = 'HTTP_ERROR';
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        /* corps non JSON */
      }
      throw new TtsHttpError(res.status, code, message);
    }
    const data: unknown = await res.json();
    if (!isTtsResponse(data)) throw new TtsHttpError(502, 'BAD_RESPONSE', 'Réponse TTS invalide');

    const blob = base64ToBlob(data.audioBase64, data.mime);
    // Si le serveur a dû se replier sur un autre moteur (quota…), on ne met pas en cache :
    // la prochaine lecture retentera le moteur demandé.
    const fellBack = (req.engine !== undefined && req.engine !== 'auto' && data.provider !== req.engine) || data.voiceFallback === true || data.fallbackReason !== undefined;
    if (!fellBack) void putCachedAudio({
      key: await audioCacheKey(req, this.id),
      blob,
      wordBoundaries: data.wordBoundaries,
      durationMs: data.durationMs,
      provider: data.provider,
      createdAt: Date.now(),
    }).catch(() => {});

    return {
      audioUrl: URL.createObjectURL(blob),
      wordBoundaries: data.wordBoundaries,
      durationMs: data.durationMs,
      provider: data.provider,
      ...(data.voiceFallback ? { voiceFallback: true } : {}),
      ...(data.fallbackReason ? { fallbackReason: data.fallbackReason } : {}),
    };
  }
}
