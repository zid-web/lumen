import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { SyncCard } from '@/components/app/SyncCard';
import { VoiceSettingsForm } from '@/components/reader/VoiceSettings';
import { Button } from '@/components/ui/button';
import { Range } from '@/components/ui/range';
import { audioCacheStats, clearAudioCache, db } from '@/lib/db';
import { fetchHealth } from '@/lib/health';
import { useSettings } from '@/store/settings';

const TTS_LABEL = { azure: 'Azure Neural Voices', elevenlabs: 'ElevenLabs', webspeech: 'Voix du navigateur (Web Speech)' } as const;
const TR_LABEL = { deepl: 'DeepL', azure: 'Azure Translator', none: 'Désactivée' } as const;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s-${title}`} className="rounded-3xl border border-line bg-surface/60 p-6">
      <h2 id={`s-${title}`} className="mb-5 text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Settings() {
  const s = useSettings();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
  const [stats, setStats] = useState<{ entries: number; bytes: number } | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const refresh = () => {
    void audioCacheStats().then(setStats);
    void navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  };
  useEffect(refresh, []);
  const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Réglages</h1>

      <Card title="Voix et langue">
        <VoiceSettingsForm />
      </Card>

      <Card title="Synchronisation">
        <SyncCard available={health.data?.sync} />
      </Card>

      <Card title="Lecture">
        <div className="space-y-6">
          <Range label="Taille du texte" value={s.fontScale} min={0.85} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)} %`} onChange={(fontScale) => s.set({ fontScale })} />
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm">Défilement automatique pendant la lecture</span>
            <input type="checkbox" role="switch" checked={s.autoScroll} onChange={(e) => s.set({ autoScroll: e.target.checked })} className="size-5 accent-violet" />
          </label>
        </div>
      </Card>

      <Card title="Services">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted">Synthèse vocale</dt>
          <dd>{health.data ? TTS_LABEL[health.data.tts] : '…'}</dd>
          <dt className="text-muted">Traduction</dt>
          <dd>{health.data ? TR_LABEL[health.data.translation] : '…'}</dd>
        </dl>
        <p className="mt-4 text-xs text-subtle">En cas d’indisponibilité du service premium, Lumen bascule automatiquement sur la voix du navigateur.</p>
      </Card>

      <Card title="Stockage">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted">Audio en cache</dt>
          <dd>{stats ? `${stats.entries} passages · ${mb(stats.bytes)}` : '…'}</dd>
          {storage && (
            <>
              <dt className="text-muted">Espace utilisé</dt>
              <dd>
                {mb(storage.usage)} sur {mb(storage.quota)}
              </dd>
            </>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => void clearAudioCache().then(refresh)} aria-label="Vider le cache audio">
            <Trash2 className="size-4" aria-hidden /> Vider le cache audio
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:text-danger"
            aria-label="Effacer toutes les données Lumen de cet appareil"
            onClick={async () => {
              if (!confirm('Effacer livres, progression, réglages et cache de cet appareil ?')) return;
              (await db()).close();
              indexedDB.deleteDatabase('lumen');
              location.assign('/app');
            }}
          >
            Tout effacer
          </Button>
        </div>
      </Card>
    </main>
  );
}
