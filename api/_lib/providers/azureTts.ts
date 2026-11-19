import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { LANGS, alignWords, type TtsRequest, type TtsResponse } from '../../../shared/contracts.js';
import { ProviderError, type ServerTtsProvider } from './types.js';

const TICKS_PER_MS = 10_000;

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);
}

export function buildSsml(req: TtsRequest, voice: string = LANGS[req.lang].narrator?.[req.gender] ?? LANGS[req.lang].azure[req.gender]): string {
  const meta = LANGS[req.lang];
  const rate = `${req.speed >= 1 ? '+' : ''}${Math.round((req.speed - 1) * 100)}%`;
  const pitch = `${req.pitch >= 0 ? '+' : ''}${req.pitch}st`;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${meta.locale}">` +
    `<voice name="${voice}"><prosody rate="${rate}" pitch="${pitch}">${escapeXml(req.text)}</prosody></voice></speak>`
  );
}

export class AzureTtsProvider implements ServerTtsProvider {
  readonly id = 'azure' as const;

  constructor(
    private readonly key: string,
    private readonly region: string,
  ) {}

  async synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResponse> {
    const meta = LANGS[req.lang];
    const narrator = meta.narrator?.[req.gender];
    if (narrator) {
      try {
        return await this.synthesizeWith(req, narrator, signal);
      } catch (err) {
        if (signal?.aborted) throw err;
        // Voix narratrice non disponible dans cette région : voix neuronale standard.
        console.warn(`[azure] ${narrator} indisponible, repli`, err instanceof Error ? err.message : err);
      }
    }
    return this.synthesizeWith(req, meta.azure[req.gender], signal);
  }

  private synthesizeWith(req: TtsRequest, voice: string, signal?: AbortSignal): Promise<TtsResponse> {
    const config = sdk.SpeechConfig.fromSubscription(this.key, this.region);
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    // `null` : pas de sortie haut-parleur, on récupère le buffer.
    const synth = new sdk.SpeechSynthesizer(config, null);
    const words: { word: string; startMs: number; endMs: number }[] = [];

    synth.wordBoundary = (_s, e) => {
      if (e.boundaryType !== sdk.SpeechSynthesisBoundaryType.Word) return;
      const startMs = e.audioOffset / TICKS_PER_MS;
      words.push({ word: e.text, startMs, endMs: startMs + e.duration / TICKS_PER_MS });
    };

    return new Promise<TtsResponse>((resolve, reject) => {
      const onAbort = () => {
        synth.close();
        reject(new ProviderError('azure', 'aborted', false));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      synth.speakSsmlAsync(
        buildSsml(req, voice),
        (result) => {
          signal?.removeEventListener('abort', onAbort);
          synth.close();
          if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
            const details = sdk.CancellationDetails.fromResult(result);
            reject(new ProviderError('azure', details.errorDetails || 'synthesis cancelled'));
            return;
          }
          resolve({
            audioBase64: Buffer.from(result.audioData).toString('base64'),
            mime: 'audio/mpeg',
            wordBoundaries: alignWords(req.text, words),
            durationMs: Math.round(result.audioDuration / TICKS_PER_MS),
            provider: 'azure',
          });
        },
        (err) => {
          signal?.removeEventListener('abort', onAbort);
          synth.close();
          reject(new ProviderError('azure', String(err)));
        },
      );
    });
  }
}
