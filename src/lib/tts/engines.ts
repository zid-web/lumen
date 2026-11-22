import type { TtsProviderId } from './types';

export type CloudEngine = 'azure' | 'elevenlabs' | 'gemini';
export const CLOUD_ENGINES: readonly CloudEngine[] = ['azure', 'elevenlabs', 'gemini'];

/** Libellés courts (barre de lecture, démo). */
export const PROVIDER_LABEL: Record<TtsProviderId, string> = {
  azure: 'Azure Neural',
  elevenlabs: 'ElevenLabs',
  gemini: 'Gemini',
  webspeech: 'Voix du navigateur',
};

/** Libellés du sélecteur de moteur. */
export const ENGINE_OPTION: Record<CloudEngine, { label: string; aria: string }> = {
  azure: { label: 'Azure', aria: 'Moteur Azure Neural' },
  gemini: { label: 'Gemini', aria: 'Moteur Google Gemini' },
  elevenlabs: { label: 'ElevenLabs ✦', aria: 'Moteur ElevenLabs, premium' },
};

export const isCloudEngine = (v: unknown): v is CloudEngine => v === 'azure' || v === 'elevenlabs' || v === 'gemini';
