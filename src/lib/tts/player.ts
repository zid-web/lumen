import { voiceSettings } from '@/store/settings';
import { cloudProvider } from '../health';
import { TtsController } from './controller';

/** Lecteur unique de l'application (bibliothèque/lecteur), avec MediaSession. */
export const appPlayer = new TtsController({ getVoice: voiceSettings, getCloud: cloudProvider, mediaSession: true });

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => appPlayer.resetDegradation());
  // Utilisé par la mise à jour automatique : on n'interrompt jamais une écoute.
  appPlayer.store.subscribe((s) => {
    document.documentElement.dataset.playing = String(s.status === 'playing' || s.status === 'loading');
  });
}
