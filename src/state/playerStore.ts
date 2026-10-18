import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/**
 * Player store: the single persisted slice for now.
 * Game rules (XP curves, level-ups, etc.) will live in `src/game/` as pure
 * functions; this store only holds state and calls into them.
 */
export interface PlayerState {
  name: string;
  level: number;
  xp: number;
}

export interface PlayerActions {
  setName: (name: string) => void;
  gainXp: (amount: number) => void;
  reset: () => void;
}

export type PlayerStore = PlayerState & PlayerActions;

export const STORAGE_KEY = 'usi.player';
export const STORAGE_VERSION = 1;

const initialState: PlayerState = {
  name: 'Shut-In',
  level: 1,
  xp: 0,
};

/** Placeholder XP threshold until the real curve lands in src/game. */
const XP_PER_LEVEL = 100;

export const usePlayerStore = create<PlayerStore>()(
  persist(
    immer((set) => ({
      ...initialState,

      setName: (name) =>
        set((state) => {
          state.name = name.trim() === '' ? initialState.name : name;
        }),

      gainXp: (amount) =>
        set((state) => {
          if (amount <= 0) return;
          state.xp += amount;
          while (state.xp >= XP_PER_LEVEL) {
            state.xp -= XP_PER_LEVEL;
            state.level += 1;
          }
        }),

      reset: () => set(() => ({ ...initialState })),
    })),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ name: state.name, level: state.level, xp: state.xp }),
    },
  ),
);
