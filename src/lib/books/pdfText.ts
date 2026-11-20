/** Logique pure de reconstruction du texte d'un PDF (testable sans pdf.js). */
export interface PdfLine {
  text: string;
  y: number;
  height: number;
  width: number;
}

const END_PUNCT = /[.!?…:»"”)\]]$/;

/** Lignes qui reviennent en haut/bas de nombreuses pages (en-têtes, pieds de page) ou numéros de page. */
export function findRunningLines(pages: PdfLine[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map((l) => normalizeEdge(l.text)));
    for (const t of edges) if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.4));
  return new Set([...counts].filter(([, n]) => n >= min).map(([t]) => t));
}

function normalizeEdge(t: string): string {
  return t.replace(/\d+/g, '#').trim();
}

const isPageNumber = (t: string) => /^(page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(\s*\/\s*\d+)?$/i.test(t.trim());

/** Regroupe les lignes en paragraphes (écarts verticaux, ponctuation, césures). */
export function linesToParagraphs(pages: PdfLine[][]): string[] {
  const running = findRunningLines(pages);
  const paragraphs: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) paragraphs.push(cur.replace(/\s+/g, ' ').trim());
    cur = '';
  };

  for (const lines of pages) {
    const kept = lines.filter((l) => l.text.trim() && !isPageNumber(l.text) && !running.has(normalizeEdge(l.text)));
    const gaps = kept.slice(1).map((l, i) => Math.abs((kept[i]?.y ?? 0) - l.y)).filter((g) => g > 0).sort((a, b) => a - b);
    const typicalGap = gaps[Math.floor(gaps.length / 2)] ?? 14;
    const maxWidth = Math.max(1, ...kept.map((l) => l.width));

    kept.forEach((line, i) => {
      const prev = kept[i - 1];
      const text = line.text.trim();
      if (prev) {
        const gap = Math.abs(prev.y - line.y);
        const prevText = prev.text.trim();
        const bigGap = gap > typicalGap * 1.45;
        const shortEnd = END_PUNCT.test(prevText) && prev.width < maxWidth * 0.8;
        if (bigGap || shortEnd) flush();
      }
      if (cur.endsWith('-') && /^\p{Ll}/u.test(text)) cur = cur.slice(0, -1) + text;
      else cur += (cur ? ' ' : '') + text;
    });
    // Un paragraphe peut continuer sur la page suivante : on ne coupe que si la page finit une phrase.
    if (END_PUNCT.test(cur.trim())) flush();
  }
  flush();
  return paragraphs;
}
