import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Download, Library, Settings, WifiOff } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { UPDATED_FLAG } from '@/lib/autoUpdate';
import { fetchHealth } from '@/lib/health';
import { OriginBanner } from '@/components/app/OriginBanner';
import { protectStorage, takeHandoffCode } from '@/lib/canonical';
import { isValidSyncCode } from '@/lib/sync/crypto';
import { startAutoSync, syncNow } from '@/lib/sync/engine';
import { useSync } from '@/store/sync';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5 * 60_000, networkMode: 'offlineFirst' } },
});

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function UpdateToast() {
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(() => {
    try {
      return sessionStorage.getItem(UPDATED_FLAG) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const h = () => setPending(document.documentElement.dataset.playing === 'true');
    window.addEventListener('lumen:sw-update-pending', h);
    return () => window.removeEventListener('lumen:sw-update-pending', h);
  }, []);
  useEffect(() => {
    if (!updated) return;
    // L'indicateur n'est effacé qu'après affichage (résiste à un double rechargement).
    const t = setTimeout(() => {
      setUpdated(false);
      try {
        sessionStorage.removeItem(UPDATED_FLAG);
      } catch {
        /* ignore */
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [updated]);

  if (updated) {
    return (
      <div role="status" className="fixed inset-x-4 top-4 z-50 mx-auto w-fit rounded-full border border-line bg-surface px-5 py-2.5 text-sm shadow-2xl">
        ✨ Lumen a été mis à jour
      </div>
    );
  }
  if (!pending) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 pl-5 shadow-2xl">
      <span className="text-sm">Nouvelle version prête : installée à la prochaine pause.</span>
      <Button size="sm" variant="secondary" onClick={() => window.dispatchEvent(new Event('lumen:sw-apply-now'))} aria-label="Mettre à jour Lumen maintenant">
        Maintenant
      </Button>
    </div>
  );
}

export default function AppLayout() {
  const online = useOnline();
  const { pathname } = useLocation();
  const inReader = pathname.startsWith('/app/read/');
  const { state: installState } = useInstallPrompt();

  useEffect(() => {
    void fetchHealth();
  }, [online]);

  useEffect(() => {
    // Transfert depuis une autre adresse : on reprend le code de synchro reçu.
    const handoff = takeHandoffCode();
    if (handoff && isValidSyncCode(handoff)) {
      const apply = () => {
        const s = useSync.getState();
        if (!s.code) s.setCode(handoff);
        void syncNow();
      };
      if (useSync.persist.hasHydrated()) apply();
      else useSync.persist.onFinishHydration(apply);
    }
    startAutoSync();
    void protectStorage();
  }, []);

  const nav = (to: string, label: string, Icon: typeof Library, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors', isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')
      }
    >
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-dvh">
        {!inReader && (
          <header className="sticky top-0 z-30 border-b border-line/50 bg-ink/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
              <Link to="/" aria-label="Lumen, page d’accueil">
                <Logo />
              </Link>
              <nav aria-label="Navigation de l’application" className="flex gap-1">
                {nav('/app', 'Bibliothèque', Library, true)}
                {nav('/app/settings', 'Réglages', Settings)}
                {installState !== 'installed' && (
                  <Link to="/installer" aria-label="Installer l’application Lumen" className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm text-amber hover:bg-surface-2">
                    <Download className="size-4" aria-hidden />
                    <span className="hidden sm:inline">Installer</span>
                  </Link>
                )}
              </nav>
            </div>
          </header>
        )}
        <OriginBanner />
        {!online && (
          <p role="status" className="flex items-center justify-center gap-2 bg-surface-2 py-2 text-xs text-muted">
            <WifiOff className="size-3.5" aria-hidden /> Hors-ligne — l’audio et les traductions déjà téléchargés restent disponibles.
          </p>
        )}
        <Outlet />
        <UpdateToast />
      </div>
    </QueryClientProvider>
  );
}
