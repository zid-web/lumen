export interface TextChunk {
  text: string;
  /** Offset du chunk dans le texte d'origine. */
  offset: number;
}

/**
 * Découpe un texte en phrases de longueur ≤ `max`, en conservant les offsets.
 * Nécessaire pour Web Speech (Chrome coupe les énoncés > ~15 s).
 */
export function chunkText(text: string, max = 220): TextChunk[] {
  const chunks: TextChunk[] = [];
  const sentenceRe = /[^.!?…。！？]+[.!?…。！？]*["»”')\]]*\s*/gu;
  let current = '';
  let currentOffset = 0;

  const push = () => {
    if (current.trim()) chunks.push({ text: current, offset: currentOffset });
    current = '';
  };

  for (const m of text.matchAll(sentenceRe)) {
    const sentence = m[0];
    const at = m.index ?? 0;
    if (sentence.length > max) {
      push();
      // Phrase trop longue : coupe sur les espaces/virgules.
      let start = 0;
      while (start < sentence.length) {
        let end = Math.min(sentence.length, start + max);
        if (end < sentence.length) {
          const cut = Math.max(sentence.lastIndexOf(', ', end), sentence.lastIndexOf(' ', end));
          if (cut > start + max / 3) end = cut + 1;
        }
        chunks.push({ text: sentence.slice(start, end), offset: at + start });
        start = end;
      }
      currentOffset = at + sentence.length;
      continue;
    }
    if (current.length + sentence.length > max) {
      push();
      currentOffset = at;
    }
    if (!current) currentOffset = at;
    current += sentence;
  }
  push();
  return chunks.length ? chunks : [{ text, offset: 0 }];
}

/** Trouve le mot qui contient (ou suit) la position `charIndex`. */
export function wordAt(text: string, charIndex: number): { start: number; length: number } | null {
  if (charIndex < 0 || charIndex >= text.length) return null;
  const re = /[\p{L}\p{N}'’-]+/gu;
  re.lastIndex = charIndex;
  const m = re.exec(text);
  if (!m || m.index === undefined) return null;
  return { start: m.index, length: m[0].length };
}
