import type { Chapter } from '../db';
import { normalizeParagraph, splitLong } from './parse';

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, li, blockquote, pre';

/** Extraction EPUB via epub.js (chargé à la demande, chunk séparé). */
export async function parseEpub(file: ArrayBuffer): Promise<{ title: string; author: string; chapters: Chapter[] }> {
  const { default: ePub } = await import('epubjs');
  const book = ePub(file);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const chapters: Chapter[] = [];
  const toc = await book.loaded.navigation.catch(() => null);
  const tocTitles = new Map<string, string>();
  toc?.toc.forEach((item) => tocTitles.set(item.href.split('#')[0] ?? item.href, item.label.trim()));

  const items: { href: string; load: (fn: unknown) => Promise<unknown>; unload: () => void }[] = [];
  (book.spine as unknown as { each: (fn: (item: (typeof items)[number]) => void) => void }).each((item) => items.push(item));

  for (const item of items) {
    try {
      const doc = (await item.load(book.load.bind(book))) as Document | Element;
      const root = 'body' in doc ? doc.body : doc;
      const nodes = Array.from(root.querySelectorAll(BLOCK_SELECTOR)).filter((n) => !n.querySelector(BLOCK_SELECTOR));
      const paragraphs = nodes.flatMap((n) => {
        const t = normalizeParagraph(n.textContent ?? '');
        return t ? splitLong(t) : [];
      });
      if (paragraphs.length === 0) continue;
      const heading = root.querySelector('h1, h2, h3')?.textContent?.trim();
      const title = tocTitles.get(item.href) ?? heading ?? `Chapitre ${chapters.length + 1}`;
      chapters.push({ title: title.slice(0, 120), paragraphs });
    } finally {
      item.unload();
    }
  }
  book.destroy();
  return { title: metadata.title || 'Sans titre', author: metadata.creator || '', chapters };
}
