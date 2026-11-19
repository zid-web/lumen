import type { SupportedLang } from '@shared/langs';

export const DEMO_LANGS = ['fr', 'en', 'es', 'de', 'it'] as const satisfies readonly SupportedLang[];
export type DemoLang = (typeof DEMO_LANGS)[number];

/** Paragraphe de démonstration (texte original), pré-traduit pour fonctionner hors-ligne. */
export const DEMO_TEXT: Record<DemoLang, string> = {
  fr: 'La nuit tombait sur la ville. Dans la petite librairie du coin, une lampe restait allumée, et quelqu’un tournait encore les pages d’un livre oublié.',
  en: 'Night was falling over the city. In the little corner bookshop, a single lamp stayed on, and someone was still turning the pages of a forgotten book.',
  es: 'La noche caía sobre la ciudad. En la pequeña librería de la esquina, una lámpara seguía encendida, y alguien aún pasaba las páginas de un libro olvidado.',
  de: 'Die Nacht senkte sich über die Stadt. In der kleinen Buchhandlung an der Ecke brannte noch eine Lampe, und jemand blätterte in einem vergessenen Buch.',
  it: 'La notte scendeva sulla città. Nella piccola libreria all’angolo, una lampada restava accesa, e qualcuno sfogliava ancora le pagine di un libro dimenticato.',
};
