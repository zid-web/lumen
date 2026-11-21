import type { Chapter } from '../db';
import { normalizeParagraph, splitLong } from './parse';

/** Balises de type « bloc » : chacune délimite un paragraphe potentiel. */
const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD',
  'BLOCKQUOTE', 'PRE', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'FIGCAPTION', 'HR',
]);
/** Contenus jamais lus à voix haute. */
const SKIP = new Set(['HEAD', 'TITLE', 'SCRIPT', 'STYLE', 'NAV', 'SVG', 'MATH', 'RT', 'RP']);
/** Pages techniques des EPUB (couverture, page de titre, jaquette Calibre…). */
const TECHNICAL_PAGE = /(^|\/)(jacket|titlepage|title-page|cover|nav|toc)[^/]*\.x?html?$/i;

/**
 * Extrait les paragraphes d'un document XHTML, quelle que soit la balise utilisée
 * (<p>, mais aussi <div> comme dans les EPUB générés par Calibre).
 */
export function extractBlocks(root: Element): string[] {
  const out: string[] = [];
  const walk = (el: Element) => {
    let inline = '';
    const flush = () => {
      const t = normalizeParagraph(inline);
      if (t) out.push(...splitLong(t));
      inline = '';
    };
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        inline += node.textContent ?? '';
      } else if (node.nodeType === 1) {
        const child = node as Element;
        const tag = child.tagName.toUpperCase();
        if (SKIP.has(tag)) continue;
        if (tag === 'BR') inline += ' ';
        else if (BLOCK.has(tag)) {
          flush();
          walk(child);
        } else inline += child.textContent ?? '';
      }
    }
    flush();
  };
  walk(root);
  return out;
}

/** Pages annexes qu'on ne lit pas à voix haute : sommaire, copyright, « du même auteur »… */
const FRONT_MATTER_TITLE = /^(contents|table of contents|table des mati[eè]res|sommaire|[ií]ndice|inhaltsverzeichnis|copyright|mentions l[eé]gales|droits|also by|other books|books by|.*\bbooks by\b|du m[eê]me auteur|des m[eê]mes auteurs)\b/i;
const COPYRIGHT_TEXT = /(all rights reserved|tous droits r[eé]serv[eé]s|isbn[\s:-]*[0-9x-]{10,}|©\s*\d{4})/i;

export function isFrontMatter(ch: Chapter, tocTitles: Set<string>): boolean {
  if (FRONT_MATTER_TITLE.test(ch.title.trim())) return true;
  const text = ch.paragraphs.join(' ');
  // Page de copyright : courte et pleine de mentions légales.
  if (text.length < 3000 && COPYRIGHT_TEXT.test(text) && (text.match(COPYRIGHT_TEXT) ?? []).length >= 1 && /isbn|rights reserved|droits r[eé]serv/i.test(text)) return true;
  // Sommaire : majorité de lignes qui sont des titres de chapitres.
  const norm = (x: string) => x.toLowerCase().replace(/^[\d.\s]+/, '').trim();
  const hits = ch.paragraphs.filter((p) => tocTitles.has(norm(p))).length;
  return ch.paragraphs.length >= 3 && hits / ch.paragraphs.length > 0.6;
}

/** Retire en tête de chapitre le numéro et le titre déjà affichés (« 5 », « The Terrible Tractors »). */
function dropLeadingHeading(paragraphs: string[], title: string): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const t = norm(title);
  let i = 0;
  while (i < Math.min(3, paragraphs.length - 1)) {
    const p = norm(paragraphs[i] ?? '');
    if (/^(chapter|chapitre|capitulo|kapitel|capitolo)?\s*[0-9ivxlc]{1,6}$/i.test(p) || (t && (p === t || t.endsWith(p) || p.endsWith(t)))) i++;
    else break;
  }
  return paragraphs.slice(i);
}

/** Extraction EPUB via epub.js (chargé à la demande, chunk séparé). */
export async function parseEpub(file: ArrayBuffer): Promise<{ title: string; author: string; chapters: Chapter[] }> {
  const { default: ePub } = await import('epubjs');
  const book = ePub(file);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const chapters: Chapter[] = [];
  const toc = await book.loaded.navigation.catch(() => null);
  const tocTitles = new Map<string, string>();
  const fileName = (href: string) => (href.split('#')[0] ?? href).split('/').pop() ?? href;
  const visit = (items: { href: string; label: string; subitems?: unknown[] }[]) =>
    items.forEach((it) => {
      const key = fileName(it.href);
      if (!tocTitles.has(key)) tocTitles.set(key, it.label.trim());
      if (Array.isArray(it.subitems)) visit(it.subitems as typeof items);
    });
  if (toc) visit(toc.toc as unknown as { href: string; label: string; subitems?: unknown[] }[]);

  const items: { href: string; linear?: string | boolean; load: (fn: unknown) => Promise<unknown>; unload: () => void }[] = [];
  (book.spine as unknown as { each: (fn: (item: (typeof items)[number]) => void) => void }).each((item) => items.push(item));

  for (const item of items) {
    if (TECHNICAL_PAGE.test(item.href) || item.linear === 'no' || item.linear === false) continue;
    try {
      const doc = (await item.load(book.load.bind(book))) as Document | Element;
      const root = ('body' in doc ? doc.body : (doc.querySelector('body') ?? doc)) as Element;
      // Jaquette Calibre insérée sous un autre nom.
      if (root.querySelector('.calibre_jacket, #calibre_jacket, .cbj_banner')) continue;
      const headingEl = root.querySelector('h1, h2, h3');
      const blocks = extractBlocks(root);
      let title = (tocTitles.get(fileName(item.href)) ?? headingEl?.textContent?.trim() ?? '').replace(/\s+/g, ' ');
      // Sans titre connu : la première ligne courte sert de titre.
      if (!title && blocks.length > 1 && (blocks[0]?.length ?? 99) <= 70) title = blocks[0] ?? '';
      const paragraphs = dropLeadingHeading(blocks, title);
      if (paragraphs.length === 0) continue;
      chapters.push({ title: (title || `Chapitre ${chapters.length + 1}`).slice(0, 120), paragraphs });
    } finally {
      item.unload();
    }
  }
  book.destroy();
  const tocSet = new Set([...tocTitles.values()].map((t) => t.toLowerCase().replace(/^[\d.\s]+/, '').trim()));
  const body = chapters.filter((c) => !isFrontMatter(c, tocSet));
  return { title: metadata.title || 'Sans titre', author: metadata.creator || '', chapters: body.length ? body : chapters };
}
