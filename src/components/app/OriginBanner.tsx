import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANONICAL_HOST, canonicalAppUrl, isNonCanonicalHost } from '@/lib/canonical';
import { generateSyncCode } from '@/lib/sync/crypto';
import { syncNow } from '@/lib/sync/engine';
import { useSync } from '@/store/sync';

/** Alerte affichée hors de l'adresse officielle, avec transfert des livres en un clic. */
export function OriginBanner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isNonCanonicalHost()) return null;

  const move = async () => {
    setBusy(true);
    setError(null);
    const sync = useSync.getState();
    let code = sync.code;
    if (!code) {
      code = generateSyncCode();
      sync.setCode(code);
    }
    await syncNow();
    const after = useSync.getState();
    if (after.status === 'error') {
      setError(after.error ?? 'Transfert impossible pour le moment.');
      setBusy(false);
      return;
    }
    window.location.href = canonicalAppUrl(code);
  };

  return (
    <div role="alert" className="border-b border-amber/40 bg-amber/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
          <span>
            Vous êtes sur une adresse secondaire : les livres importés ici ne sont pas dans votre app principale (<strong>{CANONICAL_HOST}</strong>).
            {error && <span className="block text-danger">{error}</span>}
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => void move()} disabled={busy} aria-label="Transférer mes livres vers l'adresse principale">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Déplacer mes livres
          </Button>
          <a href={canonicalAppUrl()} className="inline-flex h-9 items-center rounded-full px-3 text-muted hover:text-fg">
            Ouvrir
          </a>
        </div>
      </div>
    </div>
  );
}
