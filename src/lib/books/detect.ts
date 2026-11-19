import type { SupportedLang } from '@shared/langs';

const STOPWORDS: Partial<Record<SupportedLang, string[]>> = {
  fr: ['le', 'la', 'les', 'et', 'des', 'une', 'est', 'que', 'pas', 'dans', 'qui', 'pour', 'avec', 'il', 'elle', 'du', 'au', 'sur', 'ce', 'nous'],
  en: ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'it', 'was', 'he', 'she', 'with', 'for', 'as', 'his', 'her', 'you', 'not', 'they', 'this'],
  es: ['el', 'la', 'los', 'las', 'y', 'que', 'de', 'en', 'un', 'una', 'es', 'por', 'con', 'no', 'para', 'se', 'su', 'lo', 'como', 'pero'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'mit', 'sich', 'auf', 'für', 'ich', 'sie', 'er', 'es', 'den', 'dem', 'von'],
  it: ['il', 'lo', 'la', 'gli', 'che', 'di', 'e', 'non', 'un', 'una', 'per', 'con', 'sono', 'del', 'della', 'ma', 'come', 'anche', 'nel', 'si'],
  pt: ['o', 'a', 'os', 'as', 'e', 'que', 'de', 'não', 'um', 'uma', 'para', 'com', 'em', 'do', 'da', 'se', 'por', 'mas', 'como', 'ele'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'niet', 'ik', 'te', 'zijn', 'op', 'met', 'voor', 'hij', 'zij', 'maar', 'ook', 'als', 'aan'],
  pl: ['i', 'w', 'nie', 'na', 'się', 'jest', 'z', 'to', 'że', 'do', 'jak', 'ale', 'co', 'tak', 'po', 'od', 'za', 'by', 'już', 'jego'],
};

/** Détection légère (script + mots outils). Suffisant pour choisir la voix. */
export function detectLang(text: string, fallback: SupportedLang): SupportedLang {
  const sample = text.slice(0, 6000);
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  const letters = Math.max(1, count(/\p{L}/gu));
  if (count(/[぀-ヿ]/g) / letters > 0.05) return 'ja';
  if (count(/\p{Script=Han}/gu) / letters > 0.3) return 'zh';
  if (count(/\p{Script=Arabic}/gu) / letters > 0.3) return 'ar';
  if (count(/\p{Script=Cyrillic}/gu) / letters > 0.3) return 'ru';

  const words = sample.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 5) return fallback;
  let best: SupportedLang = fallback;
  let bestScore = 0;
  for (const [lang, list] of Object.entries(STOPWORDS) as [SupportedLang, string[]][]) {
    const set = new Set(list);
    const s = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0) / words.length;
    if (s > bestScore) {
      bestScore = s;
      best = lang;
    }
  }
  return bestScore > 0.05 ? best : fallback;
}
