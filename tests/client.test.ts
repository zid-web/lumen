import { describe, expect, it } from 'vitest';
import { detectLang } from '../src/lib/books/detect';
import { parsePlainText, splitLong } from '../src/lib/books/parse';
import { batchTexts } from '../src/lib/translate';
import { chunkText, wordAt } from '../src/lib/tts/chunk';
import { detectGender, pickVoice, type VoiceLike } from '../src/lib/tts/voices';

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, voiceURI: name, localService: true, default: false, ...extra });

describe('voix Web Speech', () => {
  it('détecte le genre par mot-clé et prénom', () => {
    expect(detectGender(v('Google UK English Female', 'en-GB'))).toBe('female');
    expect(detectGender(v('Google UK English Male', 'en-GB'))).toBe('male');
    expect(detectGender(v('Thomas', 'fr-FR'))).toBe('male');
    expect(detectGender(v('Microsoft Denise Online (Natural) - French (France)', 'fr-FR'))).toBe('female');
    expect(detectGender(v('Google français', 'fr-FR'))).toBeNull();
  });

  it('choisit la meilleure voix selon langue + genre', () => {
    const voices = [v('Amélie', 'fr-CA'), v('Thomas', 'fr-FR'), v('Microsoft Henri Online (Natural)', 'fr-FR'), v('Samantha', 'en-US')];
    expect(pickVoice(voices, 'fr', 'male').voice?.name).toBe('Microsoft Henri Online (Natural)');
    expect(pickVoice(voices, 'fr', 'female').voice?.name).toBe('Amélie');
  });

  it('simule le genre via la hauteur si introuvable', () => {
    const r = pickVoice([v('Google español', 'es-ES')], 'es', 'male');
    expect(r.genderMatched).toBe(false);
    expect(r.pitchFactor).toBeLessThan(1);
    expect(pickVoice([], 'ja', 'female').voice).toBeNull();
  });
});

describe('découpage', () => {
  it('chunkText conserve les offsets', () => {
    const text = 'Première phrase. Deuxième phrase un peu plus longue ! Troisième ?';
    const chunks = chunkText(text, 30);
    for (const c of chunks) expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
    expect(chunks.map((c) => c.text).join('')).toBe(text);
  });

  it('chunkText coupe les phrases trop longues', () => {
    const text = Array.from({ length: 80 }, (_, i) => `mot${i}`).join(' ');
    const chunks = chunkText(text, 100);
    expect(chunks.every((c) => c.text.length <= 100)).toBe(true);
    expect(chunks.map((c) => c.text).join('')).toBe(text);
  });

  it('wordAt trouve le mot courant', () => {
    expect(wordAt('Bonjour le monde', 8)).toEqual({ start: 8, length: 2 });
    expect(wordAt('Bonjour', 99)).toBeNull();
  });

  it('batchTexts respecte la limite par requête', () => {
    const batches = batchTexts(['a'.repeat(3000), 'b'.repeat(3000), 'c'.repeat(10)]);
    expect(batches).toHaveLength(2);
    expect(batches.every((b) => b.join('').length <= 4500)).toBe(true);
  });
});

describe('import de livres', () => {
  it('détecte les chapitres', () => {
    const ch = parsePlainText('Préface courte.\n\nChapitre 1\n\nIl était une fois.\n\nSuite.\n\n## Chapitre 2\nFin.', 'Livre');
    expect(ch.map((c) => c.title)).toEqual(['Livre', 'Chapitre 1', 'Chapitre 2']);
    expect(ch[1]!.paragraphs).toEqual(['Il était une fois.', 'Suite.']);
  });

  it('coupe les paragraphes très longs', () => {
    const p = 'Une phrase assez longue pour le test. '.repeat(100);
    expect(splitLong(p, 500).every((s) => s.length <= 500)).toBe(true);
  });

  it('détecte la langue', () => {
    expect(detectLang('The cat and the dog were in the garden with the children.', 'fr')).toBe('en');
    expect(detectLang('Le chat et le chien sont dans le jardin avec les enfants.', 'en')).toBe('fr');
    expect(detectLang('Der Hund und die Katze sind nicht im Garten.', 'fr')).toBe('de');
    expect(detectLang('Кошка и собака в саду.', 'fr')).toBe('ru');
    expect(detectLang('ok', 'it')).toBe('it');
  });
});
