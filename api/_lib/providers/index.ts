import type { CloudEngine } from '../../../shared/contracts.js';
import { azureSpeechConfigured, configuredEngines, type Env } from '../env.js';
import { AzureTranslatorProvider } from './azureTranslator.js';
import { AzureTtsProvider } from './azureTts.js';
import { DeeplTranslationProvider } from './deepl.js';
import { ElevenLabsTtsProvider } from './elevenlabsTts.js';
import { GeminiTtsProvider } from './geminiTts.js';
import type { ServerTranslationProvider, ServerTtsProvider } from './types.js';

/**
 * Chaîne TTS ordonnée : moteur demandé d'abord, puis l'ordre du serveur (TTS_PROVIDER),
 * les autres configurés servant de secours. Chaîne vide = le client utilise Web Speech.
 */
export function ttsChain(env: Env, engine: 'auto' | CloudEngine = 'auto'): ServerTtsProvider[] {
  const build: Record<CloudEngine, () => ServerTtsProvider | null> = {
    azure: () => (azureSpeechConfigured(env) ? new AzureTtsProvider(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION) : null),
    elevenlabs: () =>
      env.ELEVENLABS_API_KEY
        ? new ElevenLabsTtsProvider(env.ELEVENLABS_API_KEY, env.ELEVENLABS_MODEL, { male: env.ELEVENLABS_VOICE_MALE, female: env.ELEVENLABS_VOICE_FEMALE })
        : null,
    gemini: () =>
      env.GEMINI_API_KEY ? new GeminiTtsProvider(env.GEMINI_API_KEY, env.GEMINI_TTS_MODEL, { male: env.GEMINI_VOICE_MALE, female: env.GEMINI_VOICE_FEMALE }, env.GEMINI_STYLE) : null,
  };
  const order = configuredEngines(env);
  if (order.length === 0 && engine === 'auto') return [];
  const ids = engine !== 'auto' ? [engine, ...order.filter((e) => e !== engine)] : order;
  return ids.map((id) => build[id]()).filter((p): p is ServerTtsProvider => p !== null);
}

export function translationProvider(env: Env): ServerTranslationProvider | null {
  if (env.TRANSLATION_PROVIDER === 'deepl' && env.DEEPL_API_KEY) return new DeeplTranslationProvider(env.DEEPL_API_KEY);
  if (env.TRANSLATION_PROVIDER === 'azure' && env.AZURE_TRANSLATOR_KEY) return new AzureTranslatorProvider(env.AZURE_TRANSLATOR_KEY, env.AZURE_TRANSLATOR_REGION);
  return null;
}
