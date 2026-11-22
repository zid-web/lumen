import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Play, Search, Square } from 'lucide-react';
import type { VoiceInfo } from '@shared/contracts';
import { GEMINI_VOICE_CATALOG } from '@shared/geminiVoices';
import { cn } from '@/lib/cn';
import { cloudProvider } from '@/lib/health';
import { TtsController } from '@/lib/tts/controller';
import { appPlayer } from '@/lib/tts/player';
import { usePlayer } from '@/hooks/usePlayer';
import { useSettings } from '@/store/settings';

const SAMPLE: Record<string, string> = {
  fr: 'La nuit tombait sur la ville. Dans la petite librairie du coin, une lampe restait allumée.',
  en: 'Night was falling over the city. In the little corner bookshop, a single lamp stayed on.',
};

const fallback: VoiceInfo[] = GEMINI_VOICE_CATALOG.map((c) => ({ id: c.name, name: c.name, description: c.description, category: c.category, pitch: c.pitch }));
let voicesPromise: Promise<{ voices: VoiceInfo[]; full: boolean }> | null = null;

function loadVoices() {
  voicesPromise ??= fetch('/api/voices')
    .then(async (r) => {
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { voices: VoiceInfo[]; source: string };
      return { voices: d.voices.length ? d.voices : fallback, full: d.source === 'api' };
    })
    .catch(() => ({ voices: fallback, full: false }));
  return voicesPromise;
}

/** Une seule écoute à la fois, sur un lecteur séparé de celui du livre. */
let preview: TtsController | null = null;
let previewVoice = '';

/** Choix de la voix Gemini : sélection par usage, recherche dans la bibliothèque, écoute. */
export function GeminiVoicePicker() {
  const current = useSettings((s) => s.geminiVoice ?? null);
  const lang = useSettings((s) => s.lang);
  const set = useSettings((s) => s.set);
  const [voices, setVoices] = useState<VoiceInfo[]>(fallback);
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  preview ??= new TtsController({ getVoice: () => ({ gender: 'female', speed: 1, pitch: 0, engine: 'gemini', voice: previewVoice }), getCloud: cloudProvider });
  const status = usePlayer(preview, (s) => s.status);
  const notice = usePlayer(preview, (s) => s.notice);

  useEffect(() => {
    void loadVoices().then((r) => {
      setVoices(r.voices);
      setFull(r.full);
    });
    return () => preview?.stop();
  }, []);

  useEffect(() => {
    if (status === 'idle' || status === 'error') setPlaying(null);
  }, [status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? voices.filter((v) => [v.name, v.description, v.category, v.pitch].some((x) => x?.toLowerCase().includes(q)))
      : voices.filter((v) => GEMINI_VOICE_CATALOG.some((c) => c.name === v.name));
    return list.slice(0, 120);
  }, [voices, query]);

  const groups = useMemo(() => {
    const m = new Map<string, VoiceInfo[]>();
    for (const v of filtered) {
      const k = v.category ?? 'Autres voix';
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return [...m];
  }, [filtered]);

  const listen = (v: VoiceInfo) => {
    if (playing === v.id) {
      preview?.stop();
      return;
    }
    appPlayer.pause();
    previewVoice = v.id;
    setPlaying(v.id);
    preview?.setQueue({ id: `preview:${v.id}:${lang}`, paragraphs: [SAMPLE[lang] ?? SAMPLE.en ?? ''], lang, title: v.name, artist: 'Lumen', album: 'Voix Gemini' });
    void preview?.play(0);
  };

  const currentInfo = voices.find((v) => v.id === current);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">Voix Gemini</span>
        <span className="truncate text-sm text-fg">
          {current ? (currentInfo?.name ?? current) : 'Par défaut (selon Femme / Homme)'}
          {current && (
            <button type="button" onClick={() => set({ geminiVoice: null })} className="ml-2 text-xs text-subtle underline hover:text-fg">
              réinitialiser
            </button>
          )}
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={full ? `Rechercher parmi ${voices.length.toLocaleString('fr-FR')} voix…` : 'Rechercher une voix (nom, style, hauteur)…'}
          aria-label="Rechercher une voix Gemini"
          className="h-11 w-full rounded-full border border-line bg-ink-2 pl-10 pr-4 text-sm placeholder:text-subtle"
        />
      </div>

      <div ref={listRef} className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1" role="listbox" aria-label="Voix Gemini">
        {groups.length === 0 && <p className="text-sm text-subtle">Aucune voix ne correspond.</p>}
        {groups.map(([cat, list]) => (
          <div key={cat}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-subtle">{cat}</p>
            <ul className="space-y-1">
              {list.map((v) => {
                const selected = v.id === current;
                return (
                  <li key={v.id} className={cn('flex items-center gap-2 rounded-xl border px-2 py-1.5', selected ? 'border-violet/60 bg-violet/10' : 'border-transparent hover:bg-surface-2')}>
                    <button
                      type="button"
                      onClick={() => listen(v)}
                      aria-label={playing === v.id ? `Arrêter l’écoute de ${v.name}` : `Écouter ${v.name}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-fg hover:bg-line"
                    >
                      {playing === v.id ? status === 'loading' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Square className="size-3.5 fill-current" aria-hidden /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden />}
                    </button>
                    <button type="button" role="option" aria-selected={selected} onClick={() => set({ geminiVoice: v.id, engine: 'gemini' })} className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium text-fg">{v.name}</span>
                      <span className="block truncate text-xs text-subtle">{[v.description, v.pitch].filter(Boolean).join(' · ')}</span>
                    </button>
                    {selected && <Check className="size-4 shrink-0 text-violet-soft" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 min-h-4 text-xs text-subtle" role="status" aria-live="polite">
        {notice ?? (full ? '' : 'Sélection de voix ; la recherche porte sur ces voix.')}
      </p>
    </div>
  );
}
