import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { emptyRun } from '../contract';
import { parties, playToEnd } from '../testing/contract';
import game from './manifest';
it('explore', () => {
  const out: string[] = [];
  for (const d of [1, 2, 3, 4, 5] as const) {
    for (const pn of ['single', 'starter', 'full'] as const) {
      let won = 0, sc = 0, ticks = 0, wsc = 0;
      const N = 300;
      for (let seed = 1; seed <= N; seed++) {
        const r = playToEnd(game, seed, parties[pn], emptyRun(d), 20000);
        if (r.outcome?.result === 'won') { won++; wsc += r.outcome.score; }
        sc += r.outcome?.score ?? 0; ticks += r.steps;
      }
      out.push(`d${d} ${pn}: win ${(100 * won / N).toFixed(0)}% avg score ${(sc / N).toFixed(0)} (won only ${won ? (wsc / won).toFixed(0) : '-'}) avg ticks ${(ticks / N).toFixed(0)}`);
    }
  }
  writeFileSync('C:/Users/Lenovo/AppData/Local/Temp/claude/C--Users-Lenovo-Storage-Work/d61ff0ca-e3e2-4aed-97d8-fce339a03f92/scratchpad/explore.txt', out.join('\n'));
}, 600000);
