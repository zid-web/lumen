import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** À appeler au démarrage : l'événement peut survenir avant le montage de React. */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export type InstallState = 'available' | 'installed' | 'ios' | 'unsupported';

function snapshot(): InstallState {
  if (installed) return 'installed';
  if (deferred) return 'available';
  if (typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
  return 'unsupported';
}

export function useInstallPrompt(): { state: InstallState; install: () => Promise<boolean> } {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => 'unsupported' as const,
  );
  return {
    state,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === 'accepted';
    },
  };
}
