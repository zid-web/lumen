import type { SupportedLang, VoiceGender, WordBoundary } from '@shared/langs';

export type TtsProviderId = 'webspeech' | 'azure' | 'elevenlabs' | 'gemini';

export interface TtsSynthesisRequest {
  text: string;
  lang: SupportedLang;
  gender: VoiceGender;
  speed: number; // 0.75..2
  pitch: number; // -20..20 (demi-tons)
  /** Paragraphes voisins pour une intonation continue (non inclus dans la clé de cache). */
  context?: { previous?: string; next?: string };
  /** Moteur souhaité (auto = configuration du serveur). */
  engine?: TtsEngine;
}

export type TtsEngine = 'auto' | 'azure' | 'elevenlabs' | 'gemini';

export interface TtsSynthesisResult {
  /** Blob URL de l'audio. Absent pour Web Speech (lecture « live » via `speak`). */
  audioUrl?: string;
  wordBoundaries?: WordBoundary[];
  durationMs?: number;
  provider: TtsProviderId;
  /** Vrai si servi depuis le cache IndexedDB. */
  cached?: boolean;
}

export interface TtsProvider {
  readonly id: TtsProviderId;
  synthesize(req: TtsSynthesisRequest, signal?: AbortSignal): Promise<TtsSynthesisResult>;
  isAvailable(lang: SupportedLang): Promise<boolean>;
}

export const PITCH_LEVELS = { low: -4, medium: 0, high: 4 } as const;
export type PitchLevel = keyof typeof PITCH_LEVELS;

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
