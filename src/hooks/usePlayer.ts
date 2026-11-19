import { useStore } from 'zustand';
import type { PlayerState, TtsController } from '@/lib/tts/controller';

export function usePlayer<T>(controller: TtsController, selector: (s: PlayerState) => T): T {
  return useStore(controller.store, selector);
}
