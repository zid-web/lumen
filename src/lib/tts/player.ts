import { voiceSettings } from '@/store/settings';
import { cloudProvider } from '../health';
import { TtsController } from './controller';

/** Lecteur unique de l'application (bibliothèque/lecteur), avec MediaSession. */
export const appPlayer = new TtsController({ getVoice: voiceSettings, getCloud: cloudProvider, mediaSession: true });

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => appPlayer.resetDegradation());
}
