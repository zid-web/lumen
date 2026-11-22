/**
 * Chaque adresse web a sa propre bibliothèque (stockage du navigateur par origine).
 * Lumen doit donc être utilisé depuis une adresse unique : l'adresse officielle.
 */
export const CANONICAL_HOST: string = import.meta.env.VITE_CANONICAL_HOST || 'lumen-lecture-audio.vercel.app';

/** Vrai sur toute autre adresse publique (ancienne adresse, URL de déploiement…). Pas en local. */
export function isNonCanonicalHost(loc: { host: string; hostname: string } = window.location): boolean {
  return loc.host !== CANONICAL_HOST && !/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(loc.hostname);
}

export function canonicalAppUrl(code?: string): string {
  return `${window.location.protocol}//${CANONICAL_HOST}/app${code ? `#sync=${encodeURIComponent(code)}` : ''}`;
}

/** Lit (et efface de l'adresse) un code de synchro transmis par un transfert. */
export function takeHandoffCode(): string | null {
  const m = /[#&]sync=([^&]+)/.exec(window.location.hash);
  if (!m?.[1]) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return decodeURIComponent(m[1]);
}

/** Demande au navigateur de ne jamais effacer la bibliothèque (manque d'espace, nettoyage auto). */
export async function protectStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
