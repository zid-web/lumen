import { z } from 'zod';

const EnvSchema = z.object({
  TTS_PROVIDER: z.enum(['azure', 'elevenlabs', 'gemini', 'webspeech']).default('webspeech'),
  TRANSLATION_PROVIDER: z.enum(['deepl', 'azure', 'none']).default('none'),
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default('eleven_multilingual_v2'),
  /** Plafond de caractères ElevenLabs par mois (au-delà : repli Azure). */
  ELEVENLABS_MONTHLY_CHAR_LIMIT: z.coerce.number().int().nonnegative().default(9000),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TTS_MODEL: z.string().default('gemini-3.8-flash-tts'),
  /** Voix Gemini prédéfinies (modifiables sans redéployer le code). */
  GEMINI_VOICE_MALE: z.string().default('Charon'),
  GEMINI_VOICE_FEMALE: z.string().default('Aoede'),
  /** Consigne de narration (speech_metadata.style) : transmise à part, jamais prononcée. Vide = aucune. */
  GEMINI_STYLE: z.string().default('Warm, natural audiobook narration: calm, expressive, clear diction, unhurried pace.'),
  /** Plafond mensuel Gemini (≈ 1 M de caractères ≈ 2 romans ≈ 15–20 $ au tarif 2026). */
  GEMINI_MONTHLY_CHAR_LIMIT: z.coerce.number().int().nonnegative().default(1_000_000),
  ELEVENLABS_VOICE_MALE: z.string().default('JBFqnCBsd6RMkjVDRZzb'),
  ELEVENLABS_VOICE_FEMALE: z.string().default('pFZP5JQG7iQjIQuC4Bku'),
  DEEPL_API_KEY: z.string().optional(),
  AZURE_TRANSLATOR_KEY: z.string().optional(),
  AZURE_TRANSLATOR_REGION: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default(''),
  VERCEL_ENV: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Lit l'environnement en ignorant les chaînes vides (variables Vercel non renseignées). */
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  return EnvSchema.parse(cleaned);
}

export function azureSpeechConfigured(env: Env): env is Env & { AZURE_SPEECH_KEY: string; AZURE_SPEECH_REGION: string } {
  return Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION);
}

/**
 * Provider TTS effectif : le premier configuré dans l'ordre de préférence
 * (même ordre que la chaîne de secours de /api/tts), sinon `webspeech` (client).
 */
/** Moteurs serveur configurés, dans l'ordre de préférence (TTS_PROVIDER d'abord, Azure en dernier recours). */
export function configuredEngines(env: Env): ('azure' | 'elevenlabs' | 'gemini')[] {
  const available = {
    azure: azureSpeechConfigured(env),
    elevenlabs: Boolean(env.ELEVENLABS_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY),
  };
  const preferred = env.TTS_PROVIDER === 'webspeech' ? [] : [env.TTS_PROVIDER];
  const order = [...preferred, 'gemini', 'elevenlabs', 'azure'] as ('azure' | 'elevenlabs' | 'gemini')[];
  return [...new Set(order)].filter((e) => available[e]);
}

/**
 * Provider TTS effectif : le premier configuré dans l'ordre de préférence
 * (même ordre que la chaîne de secours de /api/tts), sinon `webspeech` (client).
 */
export function effectiveTtsProvider(env: Env): Env['TTS_PROVIDER'] {
  if (env.TTS_PROVIDER === 'webspeech') return 'webspeech';
  return configuredEngines(env)[0] ?? 'webspeech';
}

export function effectiveTranslationProvider(env: Env): Env['TRANSLATION_PROVIDER'] {
  if (env.TRANSLATION_PROVIDER === 'deepl' && env.DEEPL_API_KEY) return 'deepl';
  if (env.TRANSLATION_PROVIDER === 'azure' && env.AZURE_TRANSLATOR_KEY) return 'azure';
  return 'none';
}
