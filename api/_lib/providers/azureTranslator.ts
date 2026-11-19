import { z } from 'zod';
import type { TranslateRequest, TranslateResponse } from '../../../shared/contracts.js';
import { ProviderError, type ServerTranslationProvider } from './types.js';

const ResponseSchema = z.array(
  z.object({
    detectedLanguage: z.object({ language: z.string() }).optional(),
    translations: z.array(z.object({ text: z.string(), to: z.string() })),
  }),
);

const AZURE_CODES: Partial<Record<TranslateRequest['target'], string>> = { zh: 'zh-Hans', pt: 'pt' };

export class AzureTranslatorProvider implements ServerTranslationProvider {
  readonly id = 'azure' as const;

  constructor(
    private readonly key: string,
    private readonly region: string | undefined,
  ) {}

  async translate(req: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse> {
    const url = new URL('https://api.cognitive.microsofttranslator.com/translate');
    url.searchParams.set('api-version', '3.0');
    url.searchParams.set('to', AZURE_CODES[req.target] ?? req.target);
    if (req.source) url.searchParams.set('from', AZURE_CODES[req.source] ?? req.source);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.key,
        ...(this.region ? { 'Ocp-Apim-Subscription-Region': this.region } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.texts.map((Text) => ({ Text }))),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new ProviderError('azure-translator', `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const data = ResponseSchema.parse(await res.json());
    const detected = data[0]?.detectedLanguage?.language;
    return {
      translations: data.map((d) => d.translations[0]?.text ?? ''),
      ...(detected ? { detectedSource: detected } : {}),
      provider: 'azure',
    };
  }
}
