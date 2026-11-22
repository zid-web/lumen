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
  /** Paragraphes voisins : donnent au moteur l'intonation d'une lecture continue (ElevenLabs). */
  context: z.object({ previous: z.string().max(1000).optional(), next: z.string().max(1000).optional() }).optional(),
  /** Moteur souhaité : `auto` suit la configuration du serveur. */
  engine: z.enum(['auto', 'azure', 'elevenlabs', 'gemini']).optional(),
  /** Voix Gemini choisie (bibliothèque de voix) ; ignorée par les autres moteurs. */
  voice: z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N} _./:-]+$/u).optional(),
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

export const TtsProviderIdSchema = z.enum(['webspeech', 'azure', 'elevenlabs', 'gemini']);
export const CloudEngineSchema = z.enum(['azure', 'elevenlabs', 'gemini']);
export type CloudEngine = z.infer<typeof CloudEngineSchema>;
export type TtsProviderId = z.infer<typeof TtsProviderIdSchema>;

export const TtsResponseSchema = z.object({
  audioBase64: z.string(),
  mime: z.string(),
  wordBoundaries: z.array(WordBoundarySchema),
  durationMs: z.number(),
  provider: TtsProviderIdSchema,
  /** La voix demandée a été refusée : la voix par défaut du moteur a été utilisée. */
  voiceFallback: z.boolean().optional(),
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
  /** Synchronisation entre appareils disponible (nécessite Upstash). */
  sync: z.boolean(),
  /** Moteurs serveur disponibles, dans l'ordre par défaut. */
  engines: z.array(CloudEngineSchema),
  /** Caractères restants ce mois-ci par moteur payant plafonné. */
  remaining: z.record(z.number()).optional(),
  /** Caractères ElevenLabs restants ce mois-ci (plafond de sécurité), si configuré. */
  premiumRemaining: z.number().optional(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(['BAD_REQUEST', 'FORBIDDEN', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'METHOD_NOT_ALLOWED', 'PAYLOAD_TOO_LARGE', 'NOT_FOUND']),
    message: z.string(),
  }),
});
export type ApiErrorCode = z.infer<typeof ApiErrorSchema>['error']['code'];


// --- Synchronisation chiffrée entre appareils ---------------------------------
/** Identifiant dérivé du code de synchro (le serveur ne voit jamais le code ni les données en clair). */
export const SyncIdSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Identifiant de synchro invalide');
export const SyncItemSchema = z.string().regex(/^(state|book:[A-Za-z0-9-]{1,64})$/, 'Élément de synchro invalide');
export const SYNC_MAX_STATE_CHARS = 400_000;
export const SYNC_MAX_BOOK_CHARS = 1_400_000;
export const SyncPutSchema = z
  .object({ item: SyncItemSchema, data: z.string().min(1).max(SYNC_MAX_BOOK_CHARS), updatedAt: z.number().int().nonnegative() })
  .refine((v) => v.item !== 'state' || v.data.length <= SYNC_MAX_STATE_CHARS, { message: 'État de synchro trop volumineux', path: ['data'] });
export type SyncPut = z.infer<typeof SyncPutSchema>;
export const SyncRecordSchema = z.object({ data: z.string(), updatedAt: z.number() });
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

// --- Bibliothèque de voix (Gemini) -------------------------------------------
export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  pitch: z.string().optional(),
});
export type VoiceInfo = z.infer<typeof VoiceInfoSchema>;
export const VoicesResponseSchema = z.object({ voices: z.array(VoiceInfoSchema), source: z.enum(['api', 'catalog']) });
