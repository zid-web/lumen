import type { Chapter } from '../db';

const HEADING_RE = /^(#{1,3}\s+.+|(chapitre|chapter|cap[ií]tulo|kapitel|capitolo|hoofdstuk|rozdzia[łl]|глава|partie|part|livre|book)\b.{0,80})$/iu;
const MAX_PARAGRAPH = 1800;
const PARAGRAPHS_PER_PART = 40;

export function normalizeParagraph(p: string): string {
  return p.replace(/\s+/g, ' ').trim();
}

/** Coupe les paragraphes très longs en phrases (latence TTS + limite 5000 caractères). */
export function splitLong(p: string, max = MAX_PARAGRAPH): string[] {
  if (p.length <= max) return [p];
  const out: string[] = [];
  let cur = '';
  for (const s of p.match(/[^.!?…。！？]+[.!?…。！？]*\s*/gu) ?? [p]) {
    if (cur.length + s.length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
    while (cur.length > max) {
      out.push(cur.slice(0, max).trim());
      cur = cur.slice(max);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Texte brut / Markdown → chapitres. */
export function parsePlainText(raw: string, fallbackTitle = 'Texte'): Chapter[] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const hasBlankLines = /\n\s*\n/.test(text);
  const blocks = (hasBlankLines ? text.split(/\n\s*\n/) : text.split('\n')).map((b) => b.trim()).filter(Boolean);

  const chapters: Chapter[] = [];
  let current: Chapter | null = null;
  for (const block of blocks) {
    const firstLine = block.split('\n')[0]?.trim() ?? '';
    if (HEADING_RE.test(firstLine) && firstLine.length <= 90) {
      current = { title: firstLine.replace(/^#+\s*/, ''), paragraphs: [] };
      chapters.push(current);
      const rest = block.slice(firstLine.length).trim();
      if (rest) current.paragraphs.push(...splitLong(normalizeParagraph(rest)));
      continue;
    }
    if (!current) {
      current = { title: fallbackTitle, paragraphs: [] };
      chapters.push(current);
    }
    current.paragraphs.push(...splitLong(normalizeParagraph(block)));
  }

  const nonEmpty = chapters.filter((c) => c.paragraphs.length > 0);
  // Pas de titres détectés et texte long : découpe en parties.
  if (nonEmpty.length === 1 && (nonEmpty[0]?.paragraphs.length ?? 0) > PARAGRAPHS_PER_PART * 1.5) {
    const all = nonEmpty[0]?.paragraphs ?? [];
    const parts: Chapter[] = [];
    for (let i = 0; i < all.length; i += PARAGRAPHS_PER_PART) {
      parts.push({ title: `Partie ${parts.length + 1}`, paragraphs: all.slice(i, i + PARAGRAPHS_PER_PART) });
    }
    return parts;
  }
  return nonEmpty;
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sans titre';
}
