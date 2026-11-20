import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Copy, Loader2, Volume2, X } from 'lucide-react';
import { LANGS, type SupportedLang } from '@shared/langs';
import { cloudProvider } from '@/lib/health';
import { TtsController } from '@/lib/tts/controller';
import { appPlayer } from '@/lib/tts/player';
import { translateParagraphs } from '@/lib/translate';
import { voiceSettings } from '@/store/settings';

const MAX_CHARS = 400;

let speaker: TtsController | null = null;
function speak(text: string, lang: SupportedLang) {
  speaker ??= new TtsController({ getVoice: voiceSettings, getCloud: cloudProvider });
  appPlayer.pause();
  speaker.setQueue({ id: `word:${lang}:${text}`, paragraphs: [text], lang, title: text, artist: 'Lumen', album: 'Traduction' });
  void speaker.play(0);
}

interface Selected {
  text: string;
  rect: DOMRect;
  range: Range;
}

/**
 * Traduction au toucher : un appui long (mobile/tablette) ou une sélection / double-clic (ordinateur)
 * sur un mot ou une phrase du texte ouvre une bulle avec la traduction.
 */
export function SelectionTranslator({
  containerRef,
  source,
  target,
}: {
  containerRef: RefObject<HTMLElement | null>;
  source: SupportedLang;
  target: SupportedLang;
}) {
  const [sel, setSel] = useState<Selected | null>(null);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; text?: string; error?: string }>({ status: 'idle' });
  const [copied, setCopied] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => {
    setSel(null);
    setState({ status: 'idle' });
  }, []);

  // Suit la sélection du document (appui long natif sur mobile, double-clic/glisser sur ordinateur).
  useEffect(() => {
    const onChange = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = window.getSelection();
        const container = containerRef.current;
        if (!s || s.isCollapsed || s.rangeCount === 0 || !container) return;
        const range = s.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;
        const text = s.toString().replace(/\s+/g, ' ').trim();
        if (!text || text.length > MAX_CHARS) return;
        setSel({ text, rect: range.getBoundingClientRect(), range: range.cloneRange() });
      }, 300);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      clearTimeout(timer.current);
    };
  }, [containerRef]);

  // Traduit la sélection.
  useEffect(() => {
    if (!sel) return;
    if (source === target) {
      setState({ status: 'error', error: `Le texte est déjà en ${LANGS[target].label}. Changez « Ma langue » dans les réglages pour traduire.` });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    translateParagraphs([sel.text], target, source, ctrl.signal)
      .then(([t]) => setState({ status: 'done', text: t ?? '' }))
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setState({ status: 'error', error: e.message || 'Traduction indisponible.' });
      });
    return () => ctrl.abort();
  }, [sel, source, target]);

  // Fermeture : Échap, clic ailleurs ; repositionnement au défilement.
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      if (bubbleRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onScroll = () => setSel((s) => (s ? { ...s, rect: s.range.getBoundingClientRect() } : s));
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll);
    };
  }, [sel, close]);

  if (!sel) return null;

  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.min(Math.max(12, sel.rect.left + sel.rect.width / 2 - width / 2), window.innerWidth - width - 12);
  const below = sel.rect.bottom + 12 + 180 < window.innerHeight;
  const style = below ? { top: sel.rect.bottom + 12, left, width } : { bottom: window.innerHeight - sel.rect.top + 12, left, width };

  return (
    <div
      ref={bubbleRef}
      role="dialog"
      aria-label="Traduction de la sélection"
      style={style}
      className="fixed z-40 rounded-2xl border border-line bg-surface p-4 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <p lang={source} className="line-clamp-3 text-sm text-muted">
          {sel.text}
        </p>
        <button type="button" onClick={close} aria-label="Fermer la traduction" className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 min-h-6" aria-live="polite">
        {state.status === 'loading' && (
          <span className="inline-flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Traduction…
          </span>
        )}
        {state.status === 'done' && (
          <p lang={target} dir={LANGS[target].rtl ? 'rtl' : undefined} className="text-base font-medium text-fg">
            {state.text}
          </p>
        )}
        {state.status === 'error' && <p className="text-sm text-subtle">{state.error}</p>}
      </div>
      <div className="mt-3 flex gap-1 border-t border-line pt-3">
        <button type="button" onClick={() => speak(sel.text, source)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Écouter en ${LANGS[source].label}`}>
          <Volume2 className="size-4" aria-hidden /> {LANGS[source].label}
        </button>
        {state.status === 'done' && state.text && (
          <button type="button" onClick={() => speak(state.text ?? '', target)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Écouter en ${LANGS[target].label}`}>
            <Volume2 className="size-4" aria-hidden /> {LANGS[target].label}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(state.text ? `${sel.text} — ${state.text}` : sel.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="ml-auto grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Copier"
        >
          {copied ? <Check className="size-4 text-amber" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
