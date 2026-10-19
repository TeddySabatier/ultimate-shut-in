/**
 * The engine of RealtimeExample.tsx (in a real game: engine.ts). Pure: time is
 * a count of ticks, one tick is FIXED_DT_MS of game time.
 */
import { FIXED_DT_MS, type GameEngine } from '../contract';

export interface DotState {
  seed: number;
  tick: number;
  /** 0..1 across the canvas. */
  x: number;
}
export type DotAction = { type: 'tick' };

/** 3 seconds of game time. */
export const DOT_TICKS = 3000 / FIXED_DT_MS;

export const dotEngine: GameEngine<DotState, DotAction> = {
  initial: (seed) => ({ seed, tick: 0, x: 0 }),
  reduce: (s, a) => (a.type !== 'tick' || s.tick >= DOT_TICKS ? s : { ...s, tick: s.tick + 1, x: (s.tick + 1) / DOT_TICKS }),
  outcome: (s) => (s.tick < DOT_TICKS ? null : { result: 'won', score: 1000, log: ['The dot crossed.'], troopsUsed: [] }),
  botPlay: (s) => (s.tick < DOT_TICKS ? { type: 'tick' } : null),
};

