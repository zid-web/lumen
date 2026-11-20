import { create } from 'zustand';
import { db, type Book, type BookMeta } from '@/lib/db';
import { useSettings } from './settings';

interface LibraryState {
  books: BookMeta[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (book: Book) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Supprime de cet appareil sans créer de suppression à propager (appelé par la synchro). */
  removeLocal: (id: string) => Promise<void>;
}

export function toMeta(b: Book): BookMeta {
  const { chapters: _c, ...meta } = b;
  return meta;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  books: [],
  loaded: false,
  async load() {
    const d = await db();
    let metas = await d.getAll('meta');
    if (metas.length === 0 && !(await d.get('kv', 'sample-installed'))) {
      const { sampleBooks } = await import('@/lib/books/sample');
      const tx = d.transaction(['books', 'meta', 'kv'], 'readwrite');
      for (const b of sampleBooks()) {
        await tx.objectStore('books').put(b);
        await tx.objectStore('meta').put(toMeta(b));
      }
      await tx.objectStore('kv').put('1', 'sample-installed');
      await tx.done;
      metas = await d.getAll('meta');
    }
    set({ books: metas.sort((a, b) => b.addedAt - a.addedAt), loaded: true });
  },
  async add(book) {
    const d = await db();
    const tx = d.transaction(['books', 'meta'], 'readwrite');
    await tx.objectStore('books').put(book);
    await tx.objectStore('meta').put(toMeta(book));
    await tx.done;
    set({ books: [toMeta(book), ...get().books.filter((b) => b.id !== book.id)] });
  },
  async remove(id) {
    await get().removeLocal(id);
    useSettings.getState().forgetBook(id);
  },
  async removeLocal(id) {
    const d = await db();
    const tx = d.transaction(['books', 'meta'], 'readwrite');
    await tx.objectStore('books').delete(id);
    await tx.objectStore('meta').delete(id);
    await tx.done;
    set({ books: get().books.filter((b) => b.id !== id) });
  },
}));

export async function getBook(id: string): Promise<Book | undefined> {
  return (await db()).get('books', id);
}
