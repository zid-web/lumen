import { TranslateResponseSchema, type SupportedLang } from '@shared/contracts';
import { MAX_TEXT_CHARS } from '@shared/langs';
import { db } from './db';
import { sha256 } from './hash';

export class TranslationUnavailableError extends Error {}

/** Regroupe des paragraphes en lots ≤ 4500 caractères et ≤ 50 éléments. */
export function batchTexts(texts: string[], maxChars = MAX_TEXT_CHARS - 500, maxItems = 50): string[][] {
  const batches: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const t of texts) {
    if (cur.length && (size + t.length > maxChars || cur.length >= maxItems)) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(t.slice(0, MAX_TEXT_CHARS));
    size += t.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

async function translateBatch(texts: string[], target: SupportedLang, source: SupportedLang | undefined, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, target, ...(source ? { source } : {}) }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Trop de traductions, patientez quelques secondes.' : 'Traduction indisponible.');
  const data = TranslateResponseSchema.parse(await res.json());
  if (data.provider === 'none') throw new TranslationUnavailableError('Aucun service de traduction configuré.');
  return data.translations;
}

/** Traduit un chapitre (cache IndexedDB, rejoué hors-ligne). */
export async function translateParagraphs(
  paragraphs: string[],
  target: SupportedLang,
  source: SupportedLang | undefined,
  signal?: AbortSignal,
): Promise<string[]> {
  if (source === target) return paragraphs;
  const key = await sha256(`${target}|${source ?? ''}|${paragraphs.join('\n\u0000')}`);
  const d = await db();
  const hit = await d.get('translations', key);
  if (hit && hit.texts.length === paragraphs.length) return hit.texts;
  if (!navigator.onLine) throw new Error('Hors-ligne : ce chapitre n’a pas encore été traduit.');

  const out: string[] = [];
  for (const batch of batchTexts(paragraphs)) out.push(...(await translateBatch(batch, target, source, signal)));
  await d.put('translations', { key, texts: out, createdAt: Date.now() });
  return out;
}
