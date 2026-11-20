import { linesToParagraphs, type PdfLine } from './pdfText';

export class PdfNoTextError extends Error {}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Extraction du texte d'un PDF via pdf.js (chargé à la demande, chunk séparé). */
export async function parsePdf(file: ArrayBuffer): Promise<{ title: string; author: string; text: string }> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(file), isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };

    const pages: PdfLine[][] = [];
    let chars = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const lines: PdfLine[] = [];
      let line: PdfLine | null = null;
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        const it = raw as TextItem;
        const y = it.transform[5] ?? 0;
        const x = it.transform[4] ?? 0;
        if (!line || Math.abs(line.y - y) > Math.max(2, (it.height || 10) * 0.5)) {
          if (line) lines.push(line);
          line = { text: it.str, y, height: it.height, width: x + it.width };
        } else {
          line.text += it.str;
          line.width = Math.max(line.width, x + it.width);
        }
        if (it.hasEOL && line) {
          lines.push(line);
          line = null;
        }
        chars += it.str.length;
      }
      if (line) lines.push(line);
      pages.push(lines);
      page.cleanup();
    }

    if (chars < 50 * Math.max(1, Math.min(doc.numPages, 3))) {
      throw new PdfNoTextError('Ce PDF ne contient pas de texte (document scanné ou image).');
    }
    const paragraphs = linesToParagraphs(pages);
    return { title: info.Title?.trim() ?? '', author: info.Author?.trim() ?? '', text: paragraphs.join('\n\n') };
  } finally {
    await doc.destroy();
  }
}
