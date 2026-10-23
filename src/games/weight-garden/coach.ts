/**
 * What the gardener says: a short reading of the situation, chosen from the
 * state alone (so the tests can pin it). The Study troop shows it as advice;
 * everyone else sees the plain numbers.
 */
import { kindOf, roomPassed, testPct, trainPct, type RoomKind, type WeightGardenState } from './engine';

export interface Coach {
  kind: RoomKind;
  key: string;
}

/** Highest test accuracy seen so far this try, whole percent. */
function bestTest(state: WeightGardenState): number {
  let best = 0;
  for (const h of state.history) if (h.te > best) best = h.te;
  return best;
}

export function coachFor(state: WeightGardenState): Coach {
  const kind = kindOf(state);
  const at = (key: string): Coach => ({ kind, key });
  const done = roomPassed(state);
  if (kind === 'line') {
    if (done) return at('done');
    return at(trainPct(state) >= 80 ? 'near' : 'far');
  }
  if (state.replanted) return at('again');
  if (state.diverged) return at('flew');
  if (done) return at('done');
  const h = state.history;
  const last = h[h.length - 1];
  const prev = h[h.length - 2];
  if (kind === 'train') {
    if (!last) return at('start');
    if (prev && last.l > prev.l + 0.02) return at('jump');
    if (prev && prev.l > 0 && (prev.l - last.l) / prev.l < 0.2) return at('slow');
    return at('fast');
  }
  if (kind === 'xor') {
    if (state.net.hidden === 0) return at(state.rounds === 0 ? 'start' : 'stuck');
    if (state.net.hidden === 2 && state.rounds >= 3 && trainPct(state) < 90) return at('few');
    return at('climbing');
  }
  if (kind === 'noise') {
    if (!last) return at('start');
    if (testPct(state) + 4 <= bestTest(state)) return at('fell');
    if (state.rounds >= 2 && trainPct(state) - testPct(state) >= 8) return at('peak');
    return at('climbing');
  }
  return at(state.rounds === 0 ? 'start' : 'climbing');
}
