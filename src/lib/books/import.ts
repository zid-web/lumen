import { z } from 'zod';
import type { SupportedLang } from '@shared/langs';
import type { Book, Chapter } from '../db';
import { uid } from '../hash';
import { detectLang } from './detect';
import { parsePlainText, titleFromFilename } from './parse';

export const MAX_IMPORT_BYTES = 30 * 1024 * 1024;

const ImportedSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(300),
  chapters: z
    .array(z.object({ title: z.string().max(300), paragraphs: z.array(z.string().max(5000)).min(1) }))
    .min(1, 'Aucun texte lisible trouvé dans ce fichier'),
});

export class ImportError extends Error {}

function build(source: Book['source'], data: { title: string; author: string; chapters: Chapter[] }, fallbackLang: SupportedLang): Book {
  const parsed = ImportedSchema.safeParse(data);
  if (!parsed.success) throw new ImportError(parsed.error.issues[0]?.message ?? 'Fichier invalide');
  const { title, author, chapters } = parsed.data;
  const sample = chapters.flatMap((c) => c.paragraphs).slice(0, 30).join(' ');
  return {
    id: uid(),
    title,
    author,
    lang: detectLang(sample, fallbackLang),
    source,
    chapters,
    chapterCount: chapters.length,
    paragraphCount: chapters.reduce((n, c) => n + c.paragraphs.length, 0),
    addedAt: Date.now(),
    hue: Math.floor(Math.random() * 360),
  };
}

export async function importFile(file: File, fallbackLang: SupportedLang): Promise<Book> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('Fichier trop volumineux (30 Mo max).');
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub') || file.type === 'application/epub+zip') {
    const { parseEpub } = await import('./epub');
    try {
      return build('epub', await parseEpub(await file.arrayBuffer()), fallbackLang);
    } catch (e) {
      if (e instanceof ImportError) throw e;
      throw new ImportError('EPUB illisible ou protégé (DRM).');
    }
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    const title = titleFromFilename(file.name);
    return build('txt', { title, author: '', chapters: parsePlainText(await file.text(), title) }, fallbackLang);
  }
  throw new ImportError('Format non pris en charge. Utilisez .epub, .txt ou .md.');
}

export function importPaste(text: string, title: string, fallbackLang: SupportedLang): Book {
  const t = title.trim() || 'Texte collé';
  return build('paste', { title: t, author: '', chapters: parsePlainText(text, t) }, fallbackLang);
}
