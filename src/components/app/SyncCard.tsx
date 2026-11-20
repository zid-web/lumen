import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatSyncCode, generateSyncCode, isValidSyncCode } from '@/lib/sync/crypto';
import { syncNow } from '@/lib/sync/engine';
import { useSync } from '@/store/sync';

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function SyncCard({ available }: { available: boolean | undefined }) {
  const { code, lastSyncAt, status, error, setCode } = useSync();
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  if (available === false) {
    return <p className="text-sm text-muted">La synchronisation n’est pas configurée sur ce serveur.</p>;
  }

  if (!code) {
    return (
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted">
          Retrouvez vos livres, votre progression, vos marque-pages et vos réglages sur tous vos appareils, sans créer de compte. Les données sont chiffrées sur l’appareil avant l’envoi : seul votre code permet de les lire.
        </p>
        <Button
          onClick={() => {
            setCode(generateSyncCode());
            setShow(true);
            void syncNow();
          }}
          aria-label="Activer la synchronisation et créer un code"
        >
          Activer sur cet appareil
        </Button>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidSyncCode(input)) {
              setInputError('Code invalide : 20 caractères, par ex. ABCDE-12345-FGHJK-67890.');
              return;
            }
            setInputError(null);
            setCode(formatSyncCode(input));
            void syncNow();
          }}
        >
          <label htmlFor="sync-code" className="block text-sm text-muted">
            Vous avez déjà un code sur un autre appareil ?
          </label>
          <div className="flex gap-2">
            <input
              id="sync-code"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink-2 px-4 font-mono text-sm tracking-wider placeholder:text-subtle"
            />
            <Button type="submit" variant="secondary">
              Relier
            </Button>
          </div>
          {inputError && (
            <p role="alert" className="text-sm text-danger">
              {inputError}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm text-muted">Votre code de synchronisation — saisissez-le sur vos autres appareils :</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-2xl border border-line bg-ink-2 px-4 py-3 font-mono text-sm tracking-wider">{show ? code : '•••••-•••••-•••••-•••••'}</code>
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le code' : 'Afficher le code'} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            aria-label="Copier le code"
            className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            {copied ? <Check className="size-4 text-amber" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </button>
        </div>
        <p className="mt-2 text-xs text-subtle">Gardez ce code pour vous : quiconque le connaît peut lire votre bibliothèque synchronisée.</p>
      </div>

      <p className="text-sm text-muted" role="status" aria-live="polite">
        {status === 'syncing' ? 'Synchronisation…' : status === 'error' ? <span className="text-danger">{error}</span> : lastSyncAt ? `Dernière synchronisation ${ago(lastSyncAt)}.` : 'Pas encore synchronisé.'}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void syncNow()} disabled={status === 'syncing'} aria-label="Synchroniser maintenant">
          {status === 'syncing' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Synchroniser
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm('Désactiver la synchronisation sur cet appareil ? Vos données restent ici et sur vos autres appareils.')) setCode(null);
          }}
        >
          Désactiver sur cet appareil
        </Button>
      </div>
    </div>
  );
}
