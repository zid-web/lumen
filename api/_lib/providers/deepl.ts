import { z } from 'zod';
import { LANGS, type TranslateRequest, type TranslateResponse } from '../../../shared/contracts.js';
import { ProviderError, type ServerTranslationProvider } from './types.js';

const ResponseSchema = z.object({
  translations: z.array(z.object({ text: z.string(), detected_source_language: z.string().optional() })),
});

export class DeeplTranslationProvider implements ServerTranslationProvider {
  readonly id = 'deepl' as const;
  private readonly endpoint: string;

  constructor(private readonly apiKey: string) {
    this.endpoint = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  }

  async translate(req: TranslateRequest, signal?: AbortSignal): Promise<TranslateResponse> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.texts,
        target_lang: LANGS[req.target].deepl,
        ...(req.source ? { source_lang: req.source.toUpperCase() } : {}),
        preserve_formatting: true,
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new ProviderError('deepl', `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const data = ResponseSchema.parse(await res.json());
    const detected = data.translations[0]?.detected_source_language?.toLowerCase();
    return {
      translations: data.translations.map((t) => t.text),
      ...(detected ? { detectedSource: detected } : {}),
      provider: 'deepl',
    };
  }
}
