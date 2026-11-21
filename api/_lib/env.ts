import { z } from 'zod';

const EnvSchema = z.object({
  TTS_PROVIDER: z.enum(['azure', 'elevenlabs', 'webspeech']).default('webspeech'),
  TRANSLATION_PROVIDER: z.enum(['deepl', 'azure', 'none']).default('none'),
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default('eleven_multilingual_v2'),
  /** Plafond de caractères ElevenLabs par mois (au-delà : repli Azure). */
  ELEVENLABS_MONTHLY_CHAR_LIMIT: z.coerce.number().int().nonnegative().default(9000),
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
export function effectiveTtsProvider(env: Env): Env['TTS_PROVIDER'] {
  if (env.TTS_PROVIDER === 'webspeech') return 'webspeech';
  const azure = azureSpeechConfigured(env);
  const eleven = Boolean(env.ELEVENLABS_API_KEY);
  const order = env.TTS_PROVIDER === 'azure' ? (['azure', 'elevenlabs'] as const) : (['elevenlabs', 'azure'] as const);
  return order.find((p) => (p === 'azure' ? azure : eleven)) ?? 'webspeech';
}

export function effectiveTranslationProvider(env: Env): Env['TRANSLATION_PROVIDER'] {
  if (env.TRANSLATION_PROVIDER === 'deepl' && env.DEEPL_API_KEY) return 'deepl';
  if (env.TRANSLATION_PROVIDER === 'azure' && env.AZURE_TRANSLATOR_KEY) return 'azure';
  return 'none';
}
