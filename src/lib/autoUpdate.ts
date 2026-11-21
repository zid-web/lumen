/**
 * Mises à jour instantanées de la PWA (Android, Mac, navigateur) :
 *  - vérifie la présence d'une nouvelle version toutes les 60 s, au retour dans l'app et au retour du réseau ;
 *  - l'installe automatiquement, sans clic ;
 *  - si un livre est en cours de lecture, attend la pause pour ne pas couper l'écoute.
 * Les données (livres, progression, audio) sont dans IndexedDB : une mise à jour ne les touche pas.
 */
const CHECK_EVERY_MS = 60_000;
export const UPDATED_FLAG = 'lumen:just-updated';

const isPlaying = () => document.documentElement.dataset.playing === 'true';

export function startAutoUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    let pending = false;
    let reloading = false;
    const apply = () => {
      if (reloading) return;
      reloading = true;
      try {
        sessionStorage.setItem(UPDATED_FLAG, '1');
      } catch {
        /* navigation privée */
      }
      // Une nouvelle version déjà active (skipWaiting) : un simple rechargement suffit.
      if (activated) window.location.reload();
      else void updateSW(true);
    };
    // Première installation : pas de « mise à jour » à signaler.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let activated = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      activated = true;
      pending = true;
      window.dispatchEvent(new CustomEvent('lumen:sw-update-pending'));
      applyWhenIdle();
    });
    const applyWhenIdle = () => {
      if (!pending) return;
      if (isPlaying()) return; // réessayé à la prochaine pause (voir observer ci-dessous)
      apply();
    };

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        pending = true;
        window.dispatchEvent(new CustomEvent('lumen:sw-update-pending'));
        applyWhenIdle();
      },
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        const check = () => {
          if (navigator.onLine && document.visibilityState === 'visible') void reg.update().catch(() => {});
        };
        setInterval(check, CHECK_EVERY_MS);
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);
      },
    });

    // Dès que la lecture s'arrête, on applique une mise à jour en attente.
    new MutationObserver(applyWhenIdle).observe(document.documentElement, { attributes: true, attributeFilter: ['data-playing'] });
    window.addEventListener('lumen:sw-apply-now', apply);
  });
}
