import { emptyGearSlots } from './content';
import type { ArenaState } from '../types';

export function defaultArenaState(): ArenaState {
  return {
    gear: emptyGearSlots(),
    trainingSessions: {
      move: 0,
      outside: 0,
      clean: 0,
      social: 0,
      study: 0,
      sleep: 0,
      eat: 0,
      hygiene: 0,
    },
    decor: [],
    trainingCoinsThisPeriod: 0,
    trainingPeriodIndex: 0,
    activeRun: null,
    waveBoost: { bonus: 0, forWeekIndex: null },
    requests: [],
    totalRuns: 0,
  };
}
