import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isSupportedLang, SPEED_MAX, SPEED_MIN, type SupportedLang } from '@shared/langs';
import { idbStorage } from '@/lib/db';
import { uid } from '@/lib/hash';
import type { Bookmark, ReadingPosition, SyncedPrefs } from '@/lib/sync/merge';
import { PITCH_LEVELS } from '@/lib/tts/types';

export type { Bookmark, ReadingPosition } from '@/lib/sync/merge';

interface SettingsState extends SyncedPrefs {
  prefsUpdatedAt: number;
  positions: Record<string, ReadingPosition>;
  bookmarks: Bookmark[];
  deletedBooks: Record<string, number>;
  hydrated: boolean;
  /** Modifie les préférences (synchronisées entre appareils). */
  set: (patch: Partial<SyncedPrefs>) => void;
  savePosition: (bookId: string, chapter: number, paragraph: number) => void;
  toggleBookmark: (bookId: string, chapter: number, paragraph: number, excerpt: string) => boolean;
  removeBookmark: (id: string) => void;
  forgetBook: (bookId: string) => void;
  /** Remplace l'état synchronisé (après fusion avec le coffre distant). */
  replaceSynced: (s: Pick<SettingsState, 'prefsUpdatedAt' | 'positions' | 'bookmarks' | 'deletedBooks'> & { prefs: SyncedPrefs }) => void;
}

function initialLang(): SupportedLang {
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : 'fr';
  return isSupportedLang(nav) ? nav : 'fr';
}

export const clampSpeed = (s: number) => Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, s)) * 4) / 4;

export function pickPrefs(s: SyncedPrefs): SyncedPrefs {
  return {
    gender: s.gender,
    lang: s.lang,
    speed: s.speed,
    pitchLevel: s.pitchLevel,
    translate: s.translate,
    showOriginal: s.showOriginal,
    fontScale: s.fontScale,
    autoScroll: s.autoScroll,
    engine: s.engine ?? 'auto',
    geminiVoice: s.geminiVoice ?? null,
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      gender: 'female',
      lang: initialLang(),
      speed: 1,
      pitchLevel: 'medium',
      translate: false,
      showOriginal: false,
      fontScale: 1,
      autoScroll: true,
      engine: 'auto',
      geminiVoice: null,
      prefsUpdatedAt: 0,
      positions: {},
      bookmarks: [],
      deletedBooks: {},
      hydrated: false,
      set: (patch) => set({ ...patch, ...(patch.speed !== undefined ? { speed: clampSpeed(patch.speed) } : {}), prefsUpdatedAt: Date.now() }),
      savePosition: (bookId, chapter, paragraph) =>
        set((s) => ({ positions: { ...s.positions, [bookId]: { chapter, paragraph, updatedAt: Date.now() } } })),
      toggleBookmark: (bookId, chapter, paragraph, excerpt) => {
        const existing = get().bookmarks.find((b) => !b.deleted && b.bookId === bookId && b.chapter === chapter && b.paragraph === paragraph);
        const now = Date.now();
        if (existing) {
          set((s) => ({ bookmarks: s.bookmarks.map((b) => (b.id === existing.id ? { ...b, deleted: true, updatedAt: now } : b)) }));
          return false;
        }
        const b: Bookmark = { id: uid(), bookId, chapter, paragraph, excerpt: excerpt.slice(0, 160), createdAt: now, updatedAt: now };
        set((s) => ({ bookmarks: [...s.bookmarks, b] }));
        return true;
      },
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, deleted: true, updatedAt: Date.now() } : b)) })),
      forgetBook: (bookId) =>
        set((s) => {
          const { [bookId]: _removed, ...rest } = s.positions;
          const now = Date.now();
          return {
            positions: rest,
            deletedBooks: { ...s.deletedBooks, [bookId]: now },
            bookmarks: s.bookmarks.map((b) => (b.bookId === bookId && !b.deleted ? { ...b, deleted: true, updatedAt: now } : b)),
          };
        }),
      replaceSynced: ({ prefs, prefsUpdatedAt, positions, bookmarks, deletedBooks }) =>
        set({ ...prefs, engine: prefs.engine ?? 'auto', geminiVoice: prefs.geminiVoice ?? null, prefsUpdatedAt, positions, bookmarks, deletedBooks }),
    }),
    {
      name: 'lumen-settings',
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      migrate: (state) => ({ bookmarks: [], deletedBooks: {}, prefsUpdatedAt: 0, ...(state as object) }) as unknown as SettingsState,
      partialize: ({ hydrated: _h, set: _s, savePosition: _p, toggleBookmark: _t, removeBookmark: _r, forgetBook: _f, replaceSynced: _rs, ...rest }) => rest,
      onRehydrateStorage: () => () => useSettings.setState({ hydrated: true }),
    },
  ),
);

export function voiceSettings() {
  const s = useSettings.getState();
  return {
    gender: s.gender,
    speed: s.speed,
    pitch: PITCH_LEVELS[s.pitchLevel],
    engine: s.engine ?? 'auto',
    ...(s.geminiVoice ? { voice: s.geminiVoice } : {}),
  };
}
