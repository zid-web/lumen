import { describe, expect, it } from 'vitest';
import { TranslateRequestSchema, TtsRequestSchema, alignWords } from '../shared/contracts';

describe('contracts', () => {
  it('valide et borne une requête TTS', () => {
    expect(TtsRequestSchema.safeParse({ text: 'Bonjour', lang: 'fr', gender: 'male', speed: 1.25, pitch: 0 }).success).toBe(true);
    expect(TtsRequestSchema.safeParse({ text: 'x'.repeat(5001), lang: 'fr', gender: 'male' }).success).toBe(false);
    expect(TtsRequestSchema.safeParse({ text: 'ok', lang: 'xx', gender: 'male' }).success).toBe(false);
    expect(TtsRequestSchema.safeParse({ text: 'ok', lang: 'fr', gender: 'male', speed: 3 }).success).toBe(false);
    expect(TtsRequestSchema.safeParse({ text: '   ', lang: 'fr', gender: 'female' }).success).toBe(false);
  });

  it('limite le total de caractères à traduire', () => {
    expect(TranslateRequestSchema.safeParse({ texts: ['a'.repeat(3000), 'b'.repeat(2001)], target: 'en' }).success).toBe(false);
    expect(TranslateRequestSchema.safeParse({ texts: ['salut'], target: 'en' }).success).toBe(true);
  });

  it('aligne les mots sur le texte source', () => {
    const text = 'Le chat, le chat dort.';
    const r = alignWords(text, [
      { word: 'Le', startMs: 0, endMs: 100 },
      { word: 'chat', startMs: 100, endMs: 200 },
      { word: 'le', startMs: 250, endMs: 300 },
      { word: 'chat', startMs: 300, endMs: 400 },
      { word: 'absent', startMs: 400, endMs: 500 },
      { word: 'dort', startMs: 500, endMs: 600 },
    ]);
    expect(r.map((w) => w.charStart)).toEqual([0, 3, 9, 12, 17]);
    expect(text.slice(r[4]!.charStart, r[4]!.charStart + r[4]!.charLength)).toBe('dort');
  });
});
