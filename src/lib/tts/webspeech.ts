import { LANGS, type SupportedLang } from '@shared/langs';
import { chunkText, wordAt } from './chunk';
import type { TtsProvider, TtsSynthesisRequest, TtsSynthesisResult } from './types';
import { loadVoices, matchesLang, pickVoice } from './voices';

export interface SpeakHandlers {
  /** Position (dans le texte complet) du mot prononcé. */
  onWord?: (start: number, length: number) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export function webSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Fallback gratuit : `window.speechSynthesis`.
 * `synthesize` ne produit pas de fichier : la lecture se fait en direct via `speak`.
 */
export class WebSpeechTtsProvider implements TtsProvider {
  readonly id = 'webspeech' as const;

  async isAvailable(lang: SupportedLang): Promise<boolean> {
    if (!webSpeechSupported()) return false;
    const voices = await loadVoices();
    return voices.length === 0 || voices.some((v) => matchesLang(v, lang));
  }

  async synthesize(_req: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    return { provider: 'webspeech' };
  }

  /**
   * Lit `text` à partir de `fromChar`. Renvoie une fonction d'annulation.
   * Pause = annulation + reprise depuis le dernier mot (fiable sur Android/iOS).
   */
  speak(req: TtsSynthesisRequest, handlers: SpeakHandlers, fromChar = 0): () => void {
    if (!webSpeechSupported()) {
      handlers.onError?.(new Error('Web Speech non supporté'));
      return () => {};
    }
    const synth = window.speechSynthesis;
    let cancelled = false;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    synth.cancel();

    void loadVoices().then((voices) => {
      if (cancelled) return;
      const { voice, pitchFactor } = pickVoice(voices, req.lang, req.gender);
      const chunks = chunkText(req.text.slice(fromChar)).map((c) => ({ ...c, offset: c.offset + fromChar }));
      let i = 0;

      const next = () => {
        if (cancelled) return;
        const chunk = chunks[i++];
        if (!chunk) {
          clearInterval(keepAlive);
          handlers.onEnd?.();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunk.text);
        u.lang = voice?.lang ?? LANGS[req.lang].locale;
        if (voice) u.voice = voice;
        u.rate = req.speed;
        // Demi-tons → multiplicateur Web Speech (0..2, 1 = neutre).
        u.pitch = Math.min(2, Math.max(0, Math.pow(2, req.pitch / 12) * pitchFactor));
        u.onstart = () => {
          const w = wordAt(req.text, chunk.offset);
          if (w) handlers.onWord?.(w.start, w.length);
        };
        u.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          const abs = chunk.offset + e.charIndex;
          const len = e.charLength || wordAt(req.text, abs)?.length || 0;
          handlers.onWord?.(abs, len);
        };
        u.onend = () => next();
        u.onerror = (e) => {
          if (cancelled || e.error === 'interrupted' || e.error === 'canceled') return;
          clearInterval(keepAlive);
          handlers.onError?.(new Error(`speechSynthesis: ${e.error}`));
        };
        synth.speak(u);
      };

      // Contournement Chrome desktop : la synthèse se fige après ~15 s sans resume().
      keepAlive = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, 10_000);
      next();
    });

    return () => {
      cancelled = true;
      clearInterval(keepAlive);
      synth.cancel();
    };
  }
}

export const webSpeech = new WebSpeechTtsProvider();
