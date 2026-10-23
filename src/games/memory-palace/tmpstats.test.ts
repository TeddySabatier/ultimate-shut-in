import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import game from './manifest';
import { parties, playToEnd, runs } from '../testing/contract';
it('stats', () => {
  for (const [pn, party] of [['starter', parties.starter], ['full', parties.full]] as const)
  for (const d of [1, 2, 3, 4, 5] as const) {
    let won = 0, steps = 0, score = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = playToEnd(game, seed, party, { ...runs.plain, difficulty: d });
      if (r.outcome?.result === 'won') won++;
      steps += r.steps; score += r.outcome?.score ?? 0;
    }
    appendFileSync('C:/Users/Lenovo/Storage/Work/usi-memory-palace/stats.txt', `${pn} d${d} won ${won} steps ${steps / 100} score ${score / 100}\n`);
  }
});
