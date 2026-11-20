import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '@/lib/db';

/** État local de la synchro (non synchronisé lui-même). */
interface SyncStoreState {
  code: string | null;
  lastSyncAt: number | null;
  status: 'idle' | 'syncing' | 'error';
  error: string | null;
  setCode: (code: string | null) => void;
  patch: (p: Partial<Pick<SyncStoreState, 'lastSyncAt' | 'status' | 'error'>>) => void;
}

export const useSync = create<SyncStoreState>()(
  persist(
    (set) => ({
      code: null,
      lastSyncAt: null,
      status: 'idle',
      error: null,
      setCode: (code) => set({ code, lastSyncAt: null, status: 'idle', error: null }),
      patch: (p) => set(p),
    }),
    {
      name: 'lumen-sync',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ code: s.code, lastSyncAt: s.lastSyncAt }),
    },
  ),
);
