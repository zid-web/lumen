import { useEffect, useRef, useState } from 'react';
import { BookOpen, ClipboardPaste, FileUp, Loader2, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LANGS } from '@shared/langs';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { BookMeta } from '@/lib/db';
import { ImportError, importFile, importPaste } from '@/lib/books/import';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

function Cover({ book }: { book: BookMeta }) {
  return (
    <div
      aria-hidden
      className="relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl p-4"
      style={{ background: `linear-gradient(150deg, hsl(${book.hue} 70% 58%), hsl(${(book.hue + 60) % 360} 55% 28%))` }}
    >
      <div className="absolute inset-y-0 left-2 w-px bg-black/20" />
      <p className="line-clamp-4 text-[15px] font-semibold leading-snug tracking-tight text-white drop-shadow">{book.title}</p>
      {book.author && <p className="mt-1 line-clamp-1 text-xs text-white/80">{book.author}</p>}
    </div>
  );
}

export default function Library() {
  const { books, loaded, load, add, remove } = useLibrary();
  const positions = useSettings((s) => s.positions);
  const lang = useSettings((s) => s.lang);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const book = await importFile(file, lang);
      await add(book);
      navigate(`/app/read/${book.id}`);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Import impossible. Vérifiez le fichier.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onPaste = async () => {
    setError(null);
    try {
      const book = importPaste(pasteText, pasteTitle, lang);
      await add(book);
      setPasteOpen(false);
      setPasteText('');
      setPasteTitle('');
      navigate(`/app/read/${book.id}`);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Texte invalide.');
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bibliothèque</h1>
          <p className="mt-1 text-muted">{books.length} livre{books.length > 1 ? 's' : ''} sur cet appareil</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".epub,.pdf,.txt,.md,application/epub+zip,application/pdf,text/plain,text/markdown" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} tabIndex={-1} aria-hidden />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Importer un fichier EPUB, PDF, TXT ou Markdown">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
            Importer
          </Button>
          <Button variant="secondary" onClick={() => setPasteOpen(true)} aria-label="Coller un texte à écouter">
            <ClipboardPaste className="size-4" aria-hidden /> Coller
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-fg">
          {error}
        </p>
      )}

      {!loaded ? (
        <div className="mt-16 grid place-items-center" role="status">
          <Loader2 className="size-6 animate-spin text-muted" aria-hidden />
          <span className="sr-only">Chargement de la bibliothèque</span>
        </div>
      ) : books.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line p-10 text-center">
          <BookOpen className="mx-auto size-8 text-subtle" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Votre bibliothèque est vide</h2>
          <p className="mt-2 text-muted">Importez un EPUB, un PDF ou un fichier texte, ou collez un article pour l’écouter.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((b) => {
            const pos = positions[b.id];
            return (
              <li key={b.id} className="group relative">
                <Link to={`/app/read/${b.id}`} className="block rounded-2xl" aria-label={`Lire ${b.title}${b.author ? `, de ${b.author}` : ''}`}>
                  <Cover book={b} />
                </Link>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs text-subtle">
                    <p>
                      {LANGS[b.lang].label} · {b.chapterCount} chap.
                    </p>
                    {pos && <p className="mt-0.5 text-amber">Reprendre chap. {pos.chapter + 1}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer « ${b.title} » de cet appareil ?`)) void remove(b.id);
                    }}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-danger"
                    aria-label={`Supprimer ${b.title}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} title="Coller un texte">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onPaste();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="paste-title" className="mb-2 block text-sm text-muted">
              Titre
            </label>
            <input id="paste-title" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Article du jour" className="h-11 w-full rounded-xl border border-line bg-ink-2 px-4 text-sm placeholder:text-subtle" />
          </div>
          <div>
            <label htmlFor="paste-text" className="mb-2 block text-sm text-muted">
              Texte
            </label>
            <textarea id="paste-text" required value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={8} className="w-full rounded-xl border border-line bg-ink-2 p-4 text-sm leading-relaxed" />
          </div>
          <Button type="submit" className="w-full" disabled={!pasteText.trim()}>
            Ajouter et écouter
          </Button>
        </form>
      </Dialog>
    </main>
  );
}
