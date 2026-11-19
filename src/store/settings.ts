import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isSupportedLang, SPEED_MAX, SPEED_MIN, type SupportedLang, type VoiceGender } from '@shared/langs';
import { idbStorage } from '@/lib/db';
import { PITCH_LEVELS, type PitchLevel } from '@/lib/tts/types';

export interface ReadingPosition {
  chapter: number;
  paragraph: number;
  updatedAt: number;
}

interface SettingsState {
  gender: VoiceGender;
  /** Langue de l'utilisateur : cible de traduction et langue de lecture traduite. */
  lang: SupportedLang;
  speed: number;
  pitchLevel: PitchLevel;
  translate: boolean;
  showOriginal: boolean;
  fontScale: number;
  autoScroll: boolean;
  positions: Record<string, ReadingPosition>;
  hydrated: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'savePosition' | 'positions' | 'hydrated'>>) => void;
  savePosition: (bookId: string, chapter: number, paragraph: number) => void;
  forgetBook: (bookId: string) => void;
}

function initialLang(): SupportedLang {
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : 'fr';
  return isSupportedLang(nav) ? nav : 'fr';
}

export const clampSpeed = (s: number) => Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, s)) * 4) / 4;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      gender: 'female',
      lang: initialLang(),
      speed: 1,
      pitchLevel: 'medium',
      translate: false,
      showOriginal: false,
      fontScale: 1,
      autoScroll: true,
      positions: {},
      hydrated: false,
      set: (patch) => set(patch.speed !== undefined ? { ...patch, speed: clampSpeed(patch.speed) } : patch),
      savePosition: (bookId, chapter, paragraph) =>
        set((s) => ({ positions: { ...s.positions, [bookId]: { chapter, paragraph, updatedAt: Date.now() } } })),
      forgetBook: (bookId) =>
        set((s) => {
          const { [bookId]: _removed, ...rest } = s.positions;
          return { positions: rest };
        }),
    }),
    {
      name: 'lumen-settings',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ hydrated: _h, set: _s, savePosition: _p, forgetBook: _f, ...rest }) => rest,
      onRehydrateStorage: () => () => useSettings.setState({ hydrated: true }),
    },
  ),
);

export function voiceSettings() {
  const s = useSettings.getState();
  return { gender: s.gender, speed: s.speed, pitch: PITCH_LEVELS[s.pitchLevel] };
}
