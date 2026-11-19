/**
 * Constantes de langues et utilitaires purs, SANS dépendance (pas de zod) :
 * importable depuis la landing sans alourdir le bundle.
 */
export const SUPPORTED_LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh', 'ar'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export type VoiceGender = 'male' | 'female';

export interface LangMeta {
  /** Nom natif, affiché dans les sélecteurs. */
  label: string;
  /** Locale BCP-47 utilisée pour la synthèse. */
  locale: string;
  rtl?: true;
  azure: { male: string; female: string };
  /** Voix « narration » Azure (multilingues, prosodie plus naturelle). Repli sur `azure` si indisponible dans la région. */
  narrator?: { male: string; female: string };
  deepl: string;
}

export const LANGS: Record<SupportedLang, LangMeta> = {
  fr: { label: 'Français', locale: 'fr-FR', azure: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' }, narrator: { male: 'fr-FR-RemyMultilingualNeural', female: 'fr-FR-VivienneMultilingualNeural' }, deepl: 'FR' },
  en: { label: 'English', locale: 'en-US', azure: { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' }, narrator: { male: 'en-US-AndrewMultilingualNeural', female: 'en-US-AvaMultilingualNeural' }, deepl: 'EN-US' },
  es: { label: 'Español', locale: 'es-ES', azure: { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' }, narrator: { male: 'es-ES-TristanMultilingualNeural', female: 'es-ES-ArabellaMultilingualNeural' }, deepl: 'ES' },
  de: { label: 'Deutsch', locale: 'de-DE', azure: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' }, narrator: { male: 'de-DE-FlorianMultilingualNeural', female: 'de-DE-SeraphinaMultilingualNeural' }, deepl: 'DE' },
  it: { label: 'Italiano', locale: 'it-IT', azure: { male: 'it-IT-DiegoNeural', female: 'it-IT-ElsaNeural' }, narrator: { male: 'it-IT-GiuseppeMultilingualNeural', female: 'it-IT-IsabellaMultilingualNeural' }, deepl: 'IT' },
  pt: { label: 'Português', locale: 'pt-BR', azure: { male: 'pt-BR-AntonioNeural', female: 'pt-BR-FranciscaNeural' }, narrator: { male: 'pt-BR-MacerioMultilingualNeural', female: 'pt-BR-ThalitaMultilingualNeural' }, deepl: 'PT-BR' },
  nl: { label: 'Nederlands', locale: 'nl-NL', azure: { male: 'nl-NL-MaartenNeural', female: 'nl-NL-ColetteNeural' }, deepl: 'NL' },
  pl: { label: 'Polski', locale: 'pl-PL', azure: { male: 'pl-PL-MarekNeural', female: 'pl-PL-ZofiaNeural' }, deepl: 'PL' },
  ru: { label: 'Русский', locale: 'ru-RU', azure: { male: 'ru-RU-DmitryNeural', female: 'ru-RU-SvetlanaNeural' }, deepl: 'RU' },
  ja: { label: '日本語', locale: 'ja-JP', azure: { male: 'ja-JP-KeitaNeural', female: 'ja-JP-NanamiNeural' }, deepl: 'JA' },
  zh: { label: '中文', locale: 'zh-CN', azure: { male: 'zh-CN-YunxiNeural', female: 'zh-CN-XiaoxiaoNeural' }, deepl: 'ZH-HANS' },
  ar: { label: 'العربية', locale: 'ar-SA', rtl: true, azure: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' }, deepl: 'AR' },
};

export const MAX_TEXT_CHARS = 5000;

export const SPEED_MIN = 0.75;
export const SPEED_MAX = 2;
export const PITCH_MIN = -20;
export const PITCH_MAX = 20;

export interface WordBoundary {
  word: string;
  startMs: number;
  endMs: number;
  /** Offset (en caractères) du mot dans le texte source. */
  charStart: number;
  charLength: number;
}

export function isSupportedLang(v: unknown): v is SupportedLang {
  return typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v);
}

/**
 * Aligne une séquence de mots (dans l'ordre) sur le texte source, en
 * retrouvant chaque mot à partir d'un curseur. Robuste aux offsets SSML.
 */
export function alignWords(
  text: string,
  words: { word: string; startMs: number; endMs: number }[],
): WordBoundary[] {
  const out: WordBoundary[] = [];
  let cursor = 0;
  for (const w of words) {
    const needle = w.word.trim();
    if (!needle) continue;
    const idx = text.indexOf(needle, cursor);
    if (idx === -1) continue;
    out.push({ ...w, word: needle, charStart: idx, charLength: needle.length });
    cursor = idx + needle.length;
  }
  return out;
}
