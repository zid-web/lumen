import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Languages, Loader2, SlidersHorizontal } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { LANGS, type SupportedLang } from '@shared/langs';
import { HighlightedText } from '@/components/HighlightedText';
import { PlayerBar } from '@/components/reader/PlayerBar';
import { VoiceSettingsForm } from '@/components/reader/VoiceSettings';
import { ButtonLink } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { usePlayer } from '@/hooks/usePlayer';
import { cn } from '@/lib/cn';
import type { Book } from '@/lib/db';
import { appPlayer } from '@/lib/tts/player';
import { translateParagraphs } from '@/lib/translate';
import { getBook, useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

const Paragraph = memo(function Paragraph({
  index,
  text,
  original,
  active,
  lang,
  onSelect,
}: {
  index: number;
  text: string;
  original: string | null;
  active: boolean;
  lang: SupportedLang;
  onSelect: (i: number) => void;
}) {
  const word = usePlayer(appPlayer, (s) => (active ? s.word : null));
  return (
    <div data-index={index} className="group relative">
      <p
        lang={lang}
        dir={LANGS[lang].rtl ? 'rtl' : undefined}
        role="button"
        tabIndex={0}
        aria-current={active ? 'true' : undefined}
        aria-label={`Lire à partir du paragraphe ${index + 1}`}
        onClick={() => onSelect(index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSelect(index);
          }
        }}
        className={cn(
          '-mx-3 cursor-pointer rounded-xl px-3 py-2 transition-colors duration-200',
          active ? 'bg-surface text-fg' : 'text-fg/80 hover:bg-surface/50',
        )}
      >
        {active ? <HighlightedText text={text} word={word} /> : text}
      </p>
      {original && <p className="mt-1 border-l-2 border-line pl-3 text-[0.85em] leading-relaxed text-subtle">{original}</p>}
    </div>
  );
});

export default function Reader() {
  const { bookId = '' } = useParams();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const settings = useSettings();
  const { hydrated, savePosition } = settings;
  const saved = settings.positions[bookId];
  const [chapter, setChapter] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoplayNext = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Lien direct : s'assure que la bibliothèque (et les exemples) est initialisée.
      const lib = useLibrary.getState();
      if (!lib.loaded) await lib.load();
      const b = await getBook(bookId);
      if (alive) setBook(b ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [bookId]);

  // Chapitre initial = position sauvegardée (une fois le store réhydraté).
  useEffect(() => {
    if (chapter === null && hydrated && book) setChapter(Math.min(saved?.chapter ?? 0, book.chapters.length - 1));
  }, [hydrated, book, chapter, saved?.chapter]);

  const current = book && chapter !== null ? book.chapters[chapter] : undefined;
  const needsTranslation = Boolean(book && settings.translate && book.lang !== settings.lang);

  const translation = useQuery({
    queryKey: ['translation', bookId, chapter, settings.lang],
    queryFn: ({ signal }) => translateParagraphs(current?.paragraphs ?? [], settings.lang, book?.lang, signal),
    enabled: needsTranslation && Boolean(current),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  const translated = needsTranslation && translation.data ? translation.data : null;
  const paragraphs = translated ?? current?.paragraphs ?? [];
  const readLang: SupportedLang = translated ? settings.lang : (book?.lang ?? settings.lang);

  // File de lecture = paragraphes affichés, dans la langue affichée.
  useEffect(() => {
    if (!book || chapter === null || !current || (needsTranslation && translation.isPending)) return;
    const startAt = saved && saved.chapter === chapter ? Math.min(saved.paragraph, paragraphs.length - 1) : 0;
    appPlayer.setQueue(
      { id: `${book.id}:${chapter}:${readLang}`, paragraphs, lang: readLang, title: current.title, artist: book.author || 'Lumen', album: book.title },
      startAt,
    );
    if (autoplayNext.current) {
      autoplayNext.current = false;
      void appPlayer.play(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `saved` lu uniquement au chargement de la file
  }, [book, chapter, current, paragraphs, readLang, needsTranslation, translation.isPending]);

  useEffect(() => {
    if (!book || chapter === null) return;
    appPlayer.setHandlers({
      onParagraph: (_q, i) => savePosition(book.id, chapter, i),
      onHalt: (_q, i) => savePosition(book.id, chapter, i),
      onQueueEnd: () => {
        if (chapter < book.chapters.length - 1) {
          autoplayNext.current = true;
          setChapter(chapter + 1);
          savePosition(book.id, chapter + 1, 0);
        }
      },
    });
  }, [book, chapter, savePosition]);

  useEffect(() => () => appPlayer.stop(), []);

  const activeIndex = usePlayer(appPlayer, (s) => s.paragraph);
  const status = usePlayer(appPlayer, (s) => s.status);

  // Auto-scroll du paragraphe lu.
  useEffect(() => {
    if (!settings.autoScroll || status === 'idle') return;
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeIndex, status, settings.autoScroll]);

  // Raccourcis clavier : Espace = lecture/pause, ←/→ = paragraphe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, dialog, [role="button"], button')) return;
      if (e.key === ' ') {
        e.preventDefault();
        appPlayer.toggle();
      } else if (e.key === 'ArrowRight') appPlayer.next();
      else if (e.key === 'ArrowLeft') appPlayer.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSelect = useCallback((i: number) => void appPlayer.play(i), []);

  const chapterOptions = useMemo(() => book?.chapters.map((c, i) => ({ value: String(i), label: `${i + 1}. ${c.title}` })) ?? [], [book]);

  if (book === undefined || (book && chapter === null)) {
    return (
      <div className="grid min-h-dvh place-items-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted" aria-hidden />
        <span className="sr-only">Ouverture du livre…</span>
      </div>
    );
  }
  if (book === null || !current || chapter === null) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Livre introuvable</h1>
          <p className="mt-2 text-muted">Il a peut-être été supprimé de cet appareil.</p>
          <ButtonLink to="/app" className="mt-6">
            Retour à la bibliothèque
          </ButtonLink>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/50 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-3 sm:px-4">
          <Link to="/app" aria-label="Retour à la bibliothèque" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">{book.title}</p>
            <p className="truncate text-xs text-subtle">
              {LANGS[book.lang].label}
              {needsTranslation && ` → ${LANGS[settings.lang].label}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              settings.set({ translate: !settings.translate });
              appPlayer.stop();
            }}
            aria-pressed={settings.translate}
            aria-label={settings.translate ? 'Désactiver la traduction' : `Traduire en ${LANGS[settings.lang].label}`}
            className={cn('grid size-11 place-items-center rounded-full hover:bg-surface-2', settings.translate ? 'text-amber' : 'text-muted hover:text-fg')}
          >
            <Languages className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Réglages de la voix" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
            <SlidersHorizontal className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-48 pt-6 sm:px-6">
        {book.chapters.length > 1 && (
          <Select
            label="Chapitre"
            hideLabel
            value={String(chapter)}
            onChange={(v) => {
              appPlayer.stop();
              setChapter(Number(v));
              savePosition(book.id, Number(v), 0);
              window.scrollTo({ top: 0 });
            }}
            options={chapterOptions}
            className="mb-8"
          />
        )}

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{current.title}</h1>

        {needsTranslation && translation.isPending && (
          <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Traduction en {LANGS[settings.lang].label}…
          </p>
        )}
        {needsTranslation && translation.isError && (
          <p role="alert" className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            {(translation.error as Error).message} Texte original affiché.
          </p>
        )}
        {needsTranslation && translated && (
          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={settings.showOriginal} onChange={(e) => settings.set({ showOriginal: e.target.checked })} className="size-4 accent-violet" />
            Afficher le texte original
          </label>
        )}

        <div ref={listRef} className="mt-8 space-y-4 leading-[1.8]" style={{ fontSize: `${1.125 * settings.fontScale}rem` }}>
          {paragraphs.map((p, i) => (
            <Paragraph
              key={i}
              index={i}
              text={p}
              original={translated && settings.showOriginal ? (current.paragraphs[i] ?? null) : null}
              active={i === activeIndex && status !== 'idle'}
              lang={readLang}
              onSelect={onSelect}
            />
          ))}
        </div>
      </main>

      <PlayerBar total={paragraphs.length} chapterTitle={current.title} />

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Voix et langue">
        <VoiceSettingsForm onChange={() => appPlayer.refresh()} />
      </Dialog>
    </>
  );
}
