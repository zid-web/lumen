import { describe, expect, it, vi } from 'vitest';
import { createSyncHandler } from '../api/sync';
import { createMemorySyncStore } from '../api/_lib/syncStore';
import { decryptJson, deriveSyncKeys, encryptJson, formatSyncCode, generateSyncCode, isValidSyncCode, normalizeSyncCode } from '../src/lib/sync/crypto';
import { mergeStates, type SyncState } from '../src/lib/sync/merge';
import { linesToParagraphs, type PdfLine } from '../src/lib/books/pdfText';

const prefs = { gender: 'female', lang: 'fr', speed: 1, pitchLevel: 'medium', translate: false, showOriginal: false, fontScale: 1, autoScroll: true, engine: 'auto' } as const;
const state = (p: Partial<SyncState>): SyncState => ({ v: 1, prefs: { ...prefs }, prefsUpdatedAt: 0, positions: {}, bookmarks: [], deletedBooks: {}, books: [], ...p });

describe('fusion de synchro', () => {
  const now = 10_000_000_000;
  it('garde la position et les préférences les plus récentes', () => {
    const a = state({ positions: { b1: { chapter: 1, paragraph: 3, updatedAt: 100 } }, prefsUpdatedAt: 5 });
    const b = state({ positions: { b1: { chapter: 2, paragraph: 0, updatedAt: 200 }, b2: { chapter: 0, paragraph: 1, updatedAt: 50 } }, prefs: { ...prefs, speed: 1.5 }, prefsUpdatedAt: 9 });
    const m = mergeStates(a, b, now);
    expect(m.positions.b1).toMatchObject({ chapter: 2 });
    expect(m.positions.b2).toBeDefined();
    expect(m.prefs.speed).toBe(1.5);
    expect(mergeStates(b, a, now)).toEqual(m);
  });

  it('propage les suppressions de marque-pages et de livres', () => {
    const bm = { id: 'x', bookId: 'b1', chapter: 0, paragraph: 2, excerpt: 'e', createdAt: 1, updatedAt: 1 };
    const a = state({ bookmarks: [bm], books: [{ id: 'b1', updatedAt: 1 }, { id: 'b2', updatedAt: 1 }] });
    const b = state({ bookmarks: [{ ...bm, deleted: true, updatedAt: now - 500 }], deletedBooks: { b2: now - 1000 } });
    const m = mergeStates(a, b, now);
    expect(m.bookmarks[0]?.deleted).toBe(true);
    expect(m.books.map((x) => x.id)).toEqual(['b1']);
    expect(m.deletedBooks.b2).toBeDefined();
  });
});

describe('chiffrement de synchro', () => {
  it('génère et normalise des codes', () => {
    const c = generateSyncCode();
    expect(c).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    expect(isValidSyncCode(c.toLowerCase().replace(/-/g, ' '))).toBe(true);
    expect(normalizeSyncCode('abcdo-iL')).toBe('ABCD011');
    expect(formatSyncCode('abcdeabcdeabcdeabcde')).toBe('ABCDE-ABCDE-ABCDE-ABCDE');
    expect(isValidSyncCode('trop-court')).toBe(false);
  });

  it('chiffre/déchiffre et dérive un identifiant stable', async () => {
    const code = generateSyncCode();
    const k1 = await deriveSyncKeys(code);
    const k2 = await deriveSyncKeys(code.toLowerCase());
    expect(k1.id).toBe(k2.id);
    expect(k1.id).toMatch(/^[a-f0-9]{64}$/);
    const blob = await encryptJson(k1.key, { hello: 'monde', n: [1, 2, 3] });
    expect(blob).not.toContain('monde');
    expect(await decryptJson(k2.key, blob)).toEqual({ hello: 'monde', n: [1, 2, 3] });
    const other = await deriveSyncKeys(generateSyncCode());
    expect(other.id).not.toBe(k1.id);
    await expect(decryptJson(other.key, blob)).rejects.toThrow();
  });
});

describe('api/sync', () => {
  const run = (() => {
    const store = createMemorySyncStore();
    return createSyncHandler(async () => store);
  })();
  const id = 'a'.repeat(64);
  const call = (method: string, init: { item?: string; body?: unknown; id?: string } = {}) =>
    run(
      new Request(`https://lumen.test/api/sync${init.item ? `?item=${init.item}` : ''}`, {
        method,
        headers: { host: 'lumen.test', 'content-type': 'application/json', 'x-sync-id': init.id ?? id, 'x-forwarded-for': '198.51.100.7' },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      }),
    );

  it('stocke, relit et supprime des blobs', async () => {
    expect((await call('GET', { item: 'state' })).status).toBe(404);
    expect((await call('PUT', { body: { item: 'state', data: 'chiffre', updatedAt: 1 } })).status).toBe(200);
    expect(await (await call('GET', { item: 'state' })).json()).toEqual({ data: 'chiffre', updatedAt: 1 });
    await call('PUT', { body: { item: 'book:abc-1', data: 'livre', updatedAt: 2 } });
    expect((await call('DELETE', { item: 'book:abc-1' })).status).toBe(200);
    expect((await call('GET', { item: 'book:abc-1' })).status).toBe(404);
  });

  it('isole les codes et valide les entrées', async () => {
    expect((await call('GET', { item: 'state', id: 'b'.repeat(64) })).status).toBe(404);
    expect((await call('GET', { item: 'state', id: 'pas-hex' })).status).toBe(400);
    expect((await call('GET', { item: '../x' })).status).toBe(400);
    expect((await call('PUT', { body: { item: 'state', data: 'x'.repeat(500_000), updatedAt: 1 } })).status).toBe(400);
  });

  it('répond 503 sans stockage configuré', async () => {
    const off = createSyncHandler(async () => null);
    const res = await off(new Request('https://lumen.test/api/sync?item=state', { headers: { host: 'lumen.test', 'x-sync-id': id } }));
    expect(res.status).toBe(503);
    vi.restoreAllMocks();
  });
});

describe('texte PDF', () => {
  const L = (text: string, y: number, width = 500): PdfLine => ({ text, y, height: 12, width });
  it('reconstruit les paragraphes, recolle les césures et retire en-têtes et numéros', () => {
    const page = (n: number, body: PdfLine[]): PdfLine[] => [L('Mon Livre — en-tête', 800), ...body, L(String(n), 40, 20)];
    const paras = linesToParagraphs([
      page(1, [L('Il était une fois un pe-', 700), L('tit phare au bord de la mer.', 686, 300), L('Le gardien montait chaque soir', 672), L('les cent marches.', 658, 200)]),
      page(2, [L('Un soir, la brume tomba.', 700, 250), L('Ada attendit.', 686, 150)]),
      page(3, [L('Puis la lumière revint.', 700, 250)]),
    ]);
    expect(paras[0]).toBe('Il était une fois un petit phare au bord de la mer.');
    expect(paras[1]).toBe('Le gardien montait chaque soir les cent marches.');
    expect(paras.join(' ')).not.toMatch(/en-tête|^\d+$/);
  });
});
