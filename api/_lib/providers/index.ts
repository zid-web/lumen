import { azureSpeechConfigured, type Env } from '../env.js';
import { AzureTranslatorProvider } from './azureTranslator.js';
import { AzureTtsProvider } from './azureTts.js';
import { DeeplTranslationProvider } from './deepl.js';
import { ElevenLabsTtsProvider } from './elevenlabsTts.js';
import type { ServerTranslationProvider, ServerTtsProvider } from './types.js';

/**
 * Chaîne TTS ordonnée : provider choisi d'abord, puis les autres configurés en secours.
 * Une chaîne vide signifie « le client doit utiliser Web Speech ».
 */
export function ttsChain(env: Env, engine: 'auto' | 'azure' | 'elevenlabs' = 'auto'): ServerTtsProvider[] {
  const azure: ServerTtsProvider | null = azureSpeechConfigured(env) ? new AzureTtsProvider(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION) : null;
  const eleven: ServerTtsProvider | null = env.ELEVENLABS_API_KEY
    ? new ElevenLabsTtsProvider(env.ELEVENLABS_API_KEY, env.ELEVENLABS_MODEL, { male: env.ELEVENLABS_VOICE_MALE, female: env.ELEVENLABS_VOICE_FEMALE })
    : null;
  if (engine !== 'auto') {
    const first = engine === 'azure' ? azure : eleven;
    const other = engine === 'azure' ? eleven : azure;
    // Moteur demandé d'abord, l'autre en secours (même si le serveur est réglé sur Web Speech).
    if (first) return [first, other].filter((p): p is ServerTtsProvider => p !== null);
  }
  switch (env.TTS_PROVIDER) {
    case 'azure':
      return [azure, eleven].filter((p): p is ServerTtsProvider => p !== null);
    case 'elevenlabs':
      return [eleven, azure].filter((p): p is ServerTtsProvider => p !== null);
    case 'webspeech':
      return [];
  }
}

export function translationProvider(env: Env): ServerTranslationProvider | null {
  if (env.TRANSLATION_PROVIDER === 'deepl' && env.DEEPL_API_KEY) return new DeeplTranslationProvider(env.DEEPL_API_KEY);
  if (env.TRANSLATION_PROVIDER === 'azure' && env.AZURE_TRANSLATOR_KEY) return new AzureTranslatorProvider(env.AZURE_TRANSLATOR_KEY, env.AZURE_TRANSLATOR_REGION);
  return null;
}
