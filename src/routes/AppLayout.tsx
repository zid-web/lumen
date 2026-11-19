import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Download, Library, Settings, WifiOff } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { fetchHealth } from '@/lib/health';

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
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    const h = (e: Event) => setApply(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener('lumen:sw-update', h);
    return () => window.removeEventListener('lumen:sw-update', h);
  }, []);
  if (!apply) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 pl-5 shadow-2xl">
      <span className="text-sm">Une nouvelle version est disponible.</span>
      <Button size="sm" onClick={apply} aria-label="Mettre à jour Lumen maintenant">
        Mettre à jour
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
