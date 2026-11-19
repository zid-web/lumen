/**
 * Schémas Zod partagés front ↔ serverless (validation runtime).
 */
import { z } from 'zod';
import { MAX_TEXT_CHARS, PITCH_MAX, PITCH_MIN, SPEED_MAX, SPEED_MIN, SUPPORTED_LANGS } from './langs.js';

export * from './langs.js';

export const SupportedLangSchema = z.enum(SUPPORTED_LANGS);
export const GenderSchema = z.enum(['male', 'female']);

export const TtsRequestSchema = z.object({
  text: z.string().trim().min(1, 'Texte vide').max(MAX_TEXT_CHARS, `Texte limité à ${MAX_TEXT_CHARS} caractères`),
  lang: SupportedLangSchema,
  gender: GenderSchema,
  speed: z.number().min(SPEED_MIN).max(SPEED_MAX).default(1),
  pitch: z.number().int().min(PITCH_MIN).max(PITCH_MAX).default(0),
});
export type TtsRequest = z.infer<typeof TtsRequestSchema>;

export const WordBoundarySchema = z.object({
  word: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  /** Offset (en caractères) du mot dans le texte source. */
  charStart: z.number().int(),
  charLength: z.number().int(),
});

export const TtsProviderIdSchema = z.enum(['webspeech', 'azure', 'elevenlabs']);
export type TtsProviderId = z.infer<typeof TtsProviderIdSchema>;

export const TtsResponseSchema = z.object({
  audioBase64: z.string(),
  mime: z.string(),
  wordBoundaries: z.array(WordBoundarySchema),
  durationMs: z.number(),
  provider: TtsProviderIdSchema,
});
export type TtsResponse = z.infer<typeof TtsResponseSchema>;

export const TranslateRequestSchema = z
  .object({
    texts: z.array(z.string().max(MAX_TEXT_CHARS)).min(1).max(100),
    target: SupportedLangSchema,
    source: SupportedLangSchema.optional(),
  })
  .refine((v) => v.texts.reduce((n, t) => n + t.length, 0) <= MAX_TEXT_CHARS, {
    message: `Total limité à ${MAX_TEXT_CHARS} caractères par requête`,
    path: ['texts'],
  });
export type TranslateRequest = z.infer<typeof TranslateRequestSchema>;

export const TranslationProviderIdSchema = z.enum(['deepl', 'azure', 'none']);
export type TranslationProviderId = z.infer<typeof TranslationProviderIdSchema>;

export const TranslateResponseSchema = z.object({
  translations: z.array(z.string()),
  detectedSource: z.string().optional(),
  provider: TranslationProviderIdSchema,
});
export type TranslateResponse = z.infer<typeof TranslateResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  tts: TtsProviderIdSchema,
  translation: TranslationProviderIdSchema,
  rateLimit: z.enum(['upstash', 'memory']),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(['BAD_REQUEST', 'FORBIDDEN', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'METHOD_NOT_ALLOWED', 'PAYLOAD_TOO_LARGE']),
    message: z.string(),
  }),
});
export type ApiErrorCode = z.infer<typeof ApiErrorSchema>['error']['code'];

