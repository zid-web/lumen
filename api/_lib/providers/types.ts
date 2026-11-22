import type { TranslateRequest, TranslateResponse, TtsRequest, TtsResponse } from '../../../shared/contracts.js';

/** Provider TTS côté serveur : renvoie l'audio encodé + timestamps des mots. */
export interface ServerTtsProvider {
  readonly id: 'azure' | 'elevenlabs' | 'gemini';
  synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResponse>;
}

export interface ServerTranslationProvider {
  readonly id: TranslateResponse['provider'];
  translate(req: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable = true,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}
