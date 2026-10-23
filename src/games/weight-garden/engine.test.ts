/**
 * Weight Garden rules: the network maths against hand-computed values, each
 * concept the game teaches (a line cannot do XOR, a hidden layer can, a rate
 * that is too high diverges, a big network overfits noisy seeds), the plot
 * rules, party and buffs, scoring, difficulty, determinism and the bot.
 */
import { describe, expect, it } from 'vitest';
import { fnv1a, mulberry32 } from '../../game/rng';
import { emptyRun, makeMember, type Party, type RunContext } from '../contract';
import { parties, playToEnd } from '../testing/contract';
import { coachFor } from './coach';
import { centroidLine, makeSeeds } from './data';
import {
  DIVERGE_LOSS,
  engine,
  isOver,
  kindOf,
  LR_STEPS,
  planFor,
  roomConfig,
  roomPassed,
  scoreOf,
  testPct,
  trainPct,
  type WeightGardenAction,
  type WeightGardenState,
} from './engine';
import game from './manifest';
import {
  countRight,
  forward,
  gradient,
  growNet,
  loss,
  paramCount,
  params,
  randomNet,
  setParam,
  shrinkNet,
  train,
  zeroNet,
  type Net,
  type Seed,
} from './net';

const seed = (x: number, y: number, l: number, t = 1): Seed => ({ x, y, l, t });
const rngFor = (s: string) => mulberry32(fnv1a(s));
const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

/** A 2-2-1 network with round numbers, worked out by hand below. */
const HAND: Net = { hidden: 2, hw: [1, -1, 0.5, 0.5], hb: [0, -0.25], ow: [2, -1], ob: 0.5 };

const run = (difficulty: RunContext['difficulty'], extra: Partial<RunContext> = {}): RunContext => ({ ...emptyRun(difficulty), ...extra });
const start = (s = 1, d: RunContext['difficulty'] = 3, party: Party = parties.starter, extra: Partial<RunContext> = {}) =>
  engine.initial(s, party, run(d, extra), 'en');
const act = (state: WeightGardenState, ...actions: WeightGardenAction[]) => actions.reduce((st, a) => engine.reduce(st, a), state);
const botSteps = (state: WeightGardenState, n: number) => {
  let st = state;
  for (let i = 0; i < n && !isOver(st); i++) {
    const a = engine.botPlay(st, () => 0.5);
    if (!a) break;
    st = engine.reduce(st, a);
  }
  return st;
};
/** Let the bot play until the given plot (0 based) is open. */
const openPlot = (state: WeightGardenState, plot: number) => {
  let st = state;
  for (let i = 0; i < 400 && st.room < plot && !isOver(st); i++) {
    const a = engine.botPlay(st, () => 0.5);
    if (!a) break;
    st = engine.reduce(st, a);
  }
  return st;
};

describe('the network maths, checked by hand', () => {
  it('forward pass of the 2-2-1 net at (0.5, 0.25): hidden 0.25 and 0.125, output 0.875', () => {
    // p0 = 1*0.5 - 1*0.25 + 0 = 0.25; p1 = 0.5*0.5 + 0.5*0.25 - 0.25 = 0.125; out = 0.5 + 2*0.25 - 1*0.125
    const f = forward(HAND, 0.5, 0.25);
    expect(f.pre).toEqual([0.25, 0.125]);
    expect(f.act).toEqual([0.25, 0.125]);
    near(f.out, 0.875);
  });

  it('a negative signal leaks through at one tenth: (-1, 1) gives hidden -0.2 and -0.025, output 0.125', () => {
    const f = forward(HAND, -1, 1);
    near(f.pre[0]!, -2);
    near(f.act[0]!, -0.2);
    near(f.act[1]!, -0.025);
    near(f.out, 0.125);
  });

  it('loss is the mean squared miss: one seed of kind +1 at (0.5, 0.25) misses by 0.125, so 0.015625', () => {
    near(loss(HAND, [seed(0.5, 0.25, 1)]), 0.015625);
    // two seeds: (0.875 - 1)^2 = 0.015625 and (0.125 + 1)^2 = 1.265625, mean 0.640625
    near(loss(HAND, [seed(0.5, 0.25, 1), seed(-1, 1, -1)]), 0.640625);
  });

  it('backward pass, first seed: every gradient matches the hand calculation', () => {
    // dOut = 2 * (0.875 - 1) = -0.25
    const g = gradient(HAND, [seed(0.5, 0.25, 1)]);
    near(g.ob, -0.25);
    expect(g.ow[0]!).toBeCloseTo(-0.0625, 12); // dOut * 0.25
    expect(g.ow[1]!).toBeCloseTo(-0.03125, 12); // dOut * 0.125
    expect(g.hw[0]!).toBeCloseTo(-0.25, 12); // dPre0 = dOut * 2 = -0.5, times x = 0.5
    expect(g.hw[1]!).toBeCloseTo(-0.125, 12); // -0.5 times y = 0.25
    expect(g.hb[0]!).toBeCloseTo(-0.5, 12);
    expect(g.hw[2]!).toBeCloseTo(0.125, 12); // dPre1 = dOut * -1 = 0.25, times x
    expect(g.hw[3]!).toBeCloseTo(0.0625, 12);
    expect(g.hb[1]!).toBeCloseTo(0.25, 12);
  });

  it('backward pass through a leaking neuron: the slope is 0.1, not 0', () => {
    // seed (-1, 1) of kind -1: dOut = 2 * (0.125 + 1) = 2.25; both hidden neurons are below zero
    const g = gradient(HAND, [seed(-1, 1, -1)]);
    near(g.ob, 2.25);
    near(g.ow[0]!, -0.45); // 2.25 * -0.2
    near(g.ow[1]!, -0.05625); // 2.25 * -0.025
    near(g.hb[0]!, 0.45); // dPre0 = 2.25 * 2 * 0.1
    near(g.hw[0]!, -0.45);
    near(g.hw[1]!, 0.45);
    near(g.hb[1]!, -0.225); // dPre1 = 2.25 * -1 * 0.1
  });

  it('the gradient equals the slope measured by nudging each weight (central differences)', () => {
    const rng = rngFor('wg-test:numeric');
    const net = randomNet(rng, 3);
    const seeds = makeSeeds(rngFor('wg-test:data'), 'xor', 3).filter((s) => s.t === 1);
    const g = params(gradient(net, seeds));
    const flat = params(net);
    const h = 1e-6;
    flat.forEach((w, slot) => {
      const up = loss(setParam(net, slot, w + h), seeds);
      const down = loss(setParam(net, slot, w - h), seeds);
      expect(Math.abs((up - down) / (2 * h) - g[slot]!)).toBeLessThan(1e-4);
    });
  });

  it('one neuron: output is a x + b y + bias, gradient of one seed is dOut times the input', () => {
    const net: Net = { hidden: 0, hw: [], hb: [], ow: [1, 2], ob: -0.5 };
    near(forward(net, 0.5, 0.25).out, 0.5 + 0.5 - 0.5);
    const g = gradient(net, [seed(0.5, 0.25, -1)]); // out 0.5, dOut = 2 * 1.5 = 3
    near(g.ow[0]!, 1.5);
    near(g.ow[1]!, 0.75);
    near(g.ob, 3);
  });

  it('one gradient step moves each weight against its gradient by the learning rate', () => {
    const net: Net = { hidden: 0, hw: [], hb: [], ow: [0, 0], ob: 0 };
    const next = train(net, [seed(1, 0, 1)], 0.5, 1); // out 0, dOut = -2, gradient (-2, 0, -2)
    expect(next.ow).toEqual([1, 0]);
    expect(next.ob).toBe(1);
  });

  it('flat weight slots run hidden weights, hidden biases, output weights, output bias', () => {
    expect(params(HAND)).toEqual([1, -1, 0.5, 0.5, 0, -0.25, 2, -1, 0.5]);
    expect(paramCount(HAND)).toBe(9);
    expect(setParam(HAND, 8, 7).ob).toBe(7);
    expect(setParam(HAND, 6, 9).ow[0]).toBe(9);
  });

  it('growing keeps the weights already learned; shrinking from two goes back to one neuron', () => {
    const grown = growNet(HAND, rngFor('grow'));
    expect(grown.hidden).toBe(3);
    expect(grown.hw.slice(0, 4)).toEqual(HAND.hw);
    expect(grown.ow.slice(0, 2)).toEqual(HAND.ow);
    expect(shrinkNet(grown, rngFor('s')).hidden).toBe(2);
    expect(shrinkNet(HAND, rngFor('s')).hidden).toBe(0);
    expect(growNet(zeroNet(0), rngFor('g')).hidden).toBe(2);
  });
});

describe('what the garden teaches', () => {
  it('XOR cannot be solved by one neuron: after 1500 steps no plot of 25 seeds passes 80 percent', () => {
    let best = 0;
    for (let s = 1; s <= 25; s++) {
      const seeds = makeSeeds(rngFor(`wg:xor:${s}`), 'xor', 3);
      const net = train(randomNet(rngFor(`wg:n:${s}`), 0), seeds, 0.1, 1500);
      best = Math.max(best, countRight(net, seeds.filter((p) => p.t === 1)) / seeds.filter((p) => p.t === 1).length);
    }
    expect(best).toBeLessThanOrEqual(0.8);
  });

  it('XOR is solved by a hidden layer: four neurons reach 95 percent on at least 80 percent of 40 seeds', () => {
    let solved = 0;
    for (let s = 1; s <= 40; s++) {
      const seeds = makeSeeds(rngFor(`wg:xor:${s}`), 'xor', 3);
      const net = train(randomNet(rngFor(`wg:n:${s}`), 4), seeds, 0.15, 120);
      const tr = seeds.filter((p) => p.t === 1);
      if (countRight(net, tr) / tr.length >= 0.95) solved += 1;
    }
    expect(solved).toBeGreaterThanOrEqual(32);
  });

  it('a learning rate that is too high diverges: 3 on one neuron blows the loss past the limit in one press', () => {
    const st = openPlot(start(2, 3), 1);
    expect(kindOf(st)).toBe('train');
    const fast = act(st, { type: 'setLearningRate', value: 3 }, { type: 'step' });
    expect(fast.diverged).toBe(true);
    expect(fast.divergences).toBe(1);
    expect(fast.history[0]!.l).toBeGreaterThanOrEqual(DIVERGE_LOSS);
    // The gardener was replanted from fresh weights; no try was lost.
    expect(fast.loss).toBeLessThan(DIVERGE_LOSS);
    expect(fast.fails).toBe(0);
    expect(fast.rounds).toBe(1);
  });

  it('a kind rate does not diverge, and the loss falls press after press', () => {
    let st = openPlot(start(2, 3), 1);
    st = act(st, { type: 'setLearningRate', value: 0.2 });
    const first = st.loss;
    st = act(st, { type: 'step' });
    expect(st.diverged).toBe(false);
    expect(st.loss).toBeLessThan(first);
  });

  it('a rate that is too low is too slow: 0.01 runs out of presses where 0.2 passes (every seed of 20)', () => {
    for (let s = 1; s <= 20; s++) {
      const open = openPlot(start(s, 3), 1);
      let slow = act(open, { type: 'setLearningRate', value: 0.01 });
      for (let i = 0; i < roomConfig('train', 3).budget; i++) slow = act(slow, { type: 'step' });
      expect(slow.fails).toBe(1); // ran out of presses, a new try began
      let good = act(open, { type: 'setLearningRate', value: 0.2 });
      for (let i = 0; i < roomConfig('train', 3).budget && !roomPassed(good); i++) good = act(good, { type: 'step' });
      expect(roomPassed(good)).toBe(true);
      expect(good.fails).toBe(0);
    }
  });

  it('overfitting: a four-neuron net trained long gets better on its training seeds and worse on the test seeds', () => {
    let early = 0;
    let lateTest = 0;
    let trainGain = 0;
    const N = 30;
    for (let s = 1; s <= N; s++) {
      const seeds = makeSeeds(rngFor(`wg:noise:${s}`), 'noise', 3);
      const tr = seeds.filter((p) => p.t === 1);
      const te = seeds.filter((p) => p.t === 0);
      const a = train(randomNet(rngFor(`wg:n:${s}`), 4), seeds, 0.3, 40);
      const b = train(a, seeds, 0.3, 3000);
      early += countRight(a, te) / te.length / N;
      lateTest += countRight(b, te) / te.length / N;
      trainGain += (countRight(b, tr) - countRight(a, tr)) / tr.length / N;
    }
    expect(trainGain).toBeGreaterThan(0.02); // training accuracy keeps climbing
    expect(early - lateTest).toBeGreaterThan(0.04); // while test accuracy falls
  });

  it('staying small works: one neuron on the noisy plot reaches the plot goal on the test seeds on 90 percent of 40 seeds', () => {
    let ok = 0;
    for (let s = 1; s <= 40; s++) {
      const seeds = makeSeeds(rngFor(`wg:noise:${s}`), 'noise', 3);
      const te = seeds.filter((p) => p.t === 0);
      const line = train(zeroNet(0), seeds, 0.3, 150);
      if ((countRight(line, te) * 100) / te.length >= roomConfig('noise', 3).goalPct) ok += 1;
    }
    expect(ok).toBeGreaterThanOrEqual(36);
  });

  it('the plot of hidden test seeds is really held out: training never looks at them', () => {
    const seeds = makeSeeds(rngFor('held-out'), 'noise', 3);
    const withoutTest = seeds.filter((s) => s.t === 1);
    const net = randomNet(rngFor('n'), 4);
    expect(train(net, seeds, 0.3, 20)).toEqual(train(net, withoutTest, 0.3, 20));
  });

  it('the hand-turned plot can always be solved: the centroid line reaches 95 percent on every seed of 100, at every difficulty', () => {
    for (let d = 1; d <= 5; d++) {
      for (let s = 1; s <= 100; s++) {
        const seeds = makeSeeds(rngFor(`wg:line:${d}:${s}`), 'line', d);
        const c = centroidLine(seeds);
        const net: Net = { hidden: 0, hw: [], hb: [], ow: [Math.round(c.a * 10) / 10, Math.round(c.b * 10) / 10], ob: Math.round(c.c * 10) / 10 };
        const tr = seeds.filter((p) => p.t === 1);
        expect(countRight(net, tr) / tr.length).toBeGreaterThanOrEqual(0.95);
      }
    }
  });

  it('every plot has both kinds of seed, training and test, inside the plot', () => {
    for (const kind of ['line', 'train', 'xor', 'noise', 'boss'] as const) {
      const seeds = makeSeeds(rngFor(`wg:${kind}`), kind, 4);
      for (const t of [0, 1]) {
        const part = seeds.filter((p) => p.t === t);
        expect(part.some((p) => p.l > 0)).toBe(true);
        expect(part.some((p) => p.l < 0)).toBe(true);
      }
      for (const p of seeds) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1.15);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1.15);
      }
    }
  });
});

describe('the rules of a plot', () => {
  it('the number of plots follows the difficulty: 3, 4, then 5', () => {
    expect([1, 2, 3, 4, 5].map((d) => planFor(d).length)).toEqual([3, 4, 5, 5, 5]);
    expect(start(1, 1).plan).toEqual(['line', 'train', 'xor']);
    expect(start(1, 5).plan[4]).toBe('boss');
  });

  it('starts on the hand-turned plot with a net of one neuron, nothing used', () => {
    const st = start();
    expect(kindOf(st)).toBe('line');
    expect(st.net.hidden).toBe(0);
    expect(st.rounds).toBe(0);
    expect(st.fails).toBe(0);
    expect(engine.outcome(st)).toBeNull();
    expect(st.trainN).toBeGreaterThan(0);
    expect(st.testN).toBeGreaterThan(0);
  });

  it('turning a weight updates the accuracy and the loss, rounds to a tenth and stays within four', () => {
    const st = start(3);
    const c = centroidLine(st.seeds);
    const set = act(
      st,
      { type: 'setWeight', slot: 0, value: Math.round(c.a * 10) / 10 },
      { type: 'setWeight', slot: 1, value: Math.round(c.b * 10) / 10 },
      { type: 'setWeight', slot: 2, value: Math.round(c.c * 10) / 10 },
    );
    expect(set.loss).toBeLessThan(st.loss);
    expect(trainPct(set)).toBeGreaterThanOrEqual(95);
    expect(roomPassed(set)).toBe(true);
    expect(act(st, { type: 'setWeight', slot: 0, value: 99 }).net.ow[0]).toBe(4);
    expect(act(st, { type: 'setWeight', slot: 0, value: 1.234 }).net.ow[0]).toBe(1.2);
  });

  it('bad actions change nothing: unknown slot, not a number, Train on the hand-turned plot, neurons on plots without a hidden layer', () => {
    const st = start();
    expect(act(st, { type: 'setWeight', slot: 3, value: 1 })).toBe(st);
    expect(act(st, { type: 'setWeight', slot: -1, value: 1 })).toBe(st);
    expect(act(st, { type: 'setWeight', slot: 0, value: Number.NaN })).toBe(st);
    expect(act(st, { type: 'step' })).toBe(st);
    expect(act(st, { type: 'addNeuron' })).toBe(st);
    expect(act(st, { type: 'removeNeuron' })).toBe(st);
    expect(act(st, { type: 'hint' })).toBe(st);
  });

  it('Next plot is refused until the goal is met', () => {
    const st = start(4);
    expect(roomPassed(st)).toBe(false);
    expect(act(st, { type: 'nextRoom' })).toBe(st);
  });

  it('one Train press takes the plot batch of gradient steps and uses one press', () => {
    const st = openPlot(start(5, 3), 1);
    const after = act(st, { type: 'step' });
    expect(after.rounds).toBe(1);
    expect(after.steps - st.steps).toBe(roomConfig('train', 3).batch);
    expect(after.history).toHaveLength(1);
    expect(after.history[0]!.l).toBe(after.loss);
  });

  it('the learning rate is clamped and rounded', () => {
    const st = openPlot(start(5, 3), 1);
    expect(act(st, { type: 'setLearningRate', value: 99 }).lr).toBe(3);
    expect(act(st, { type: 'setLearningRate', value: 0 }).lr).toBe(0.01);
    expect(act(st, { type: 'setLearningRate', value: 0.126 }).lr).toBe(0.13);
    expect(LR_STEPS.every((v, i) => i === 0 || v > LR_STEPS[i - 1]!)).toBe(true);
  });

  it('hidden neurons: one to two, three, four and no more; removing goes four, three, two, one neuron', () => {
    let st = openPlot(start(6, 3), 2);
    expect(kindOf(st)).toBe('xor');
    expect(st.net.hidden).toBe(0);
    const sizes: number[] = [];
    for (let i = 0; i < 5; i++) {
      st = act(st, { type: 'addNeuron' });
      sizes.push(st.net.hidden);
    }
    expect(sizes).toEqual([2, 3, 4, 4, 4]);
    const down: number[] = [];
    for (let i = 0; i < 5; i++) {
      st = act(st, { type: 'removeNeuron' });
      down.push(st.net.hidden);
    }
    expect(down).toEqual([3, 2, 0, 0, 0]);
  });

  it('running out of presses costs a try and replants the gardener (same size, fresh weights)', () => {
    let found = 0;
    for (let s = 1; s <= 30 && found === 0; s++) {
      let st = openPlot(start(s, 3), 2);
      st = act(st, { type: 'addNeuron' }, { type: 'addNeuron' }, { type: 'setLearningRate', value: 0.01 });
      const before = st.net;
      for (let i = 0; i < st.budget && !roomPassed(st); i++) st = act(st, { type: 'step' });
      if (roomPassed(st)) continue;
      found = s;
      expect(st.fails).toBe(1);
      expect(st.replanted).toBe(true);
      expect(st.rounds).toBe(0);
      expect(st.history).toHaveLength(0);
      expect(st.net.hidden).toBe(3);
      expect(st.net).not.toEqual(before);
      expect(isOver(st)).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('after the third failed try the garden wilts: the game is lost, with the score of the plots already settled', () => {
    let st = openPlot(start(8, 3), 2);
    st = act(st, { type: 'setLearningRate', value: 0.01 });
    const settled = st.cleared.length;
    expect(settled).toBe(2);
    for (let i = 0; i < st.budget * 3 + 3 && !isOver(st); i++) st = act(st, { type: 'step' });
    expect(st.wilted).toBe(true);
    const out = engine.outcome(st)!;
    expect(out.result).toBe('lost');
    expect(out.score).toBe(scoreOf(st));
    expect(out.score).toBeGreaterThan(0);
    expect(out.log.join(' ')).toContain('wilted');
  });

  it('a revive buff gives one more try before the garden wilts', () => {
    const plain = openPlot(start(8, 3), 2);
    const lucky = openPlot(start(8, 3, parties.starter, { buffs: [{ id: 'r', kind: 'revive', amount: 1 }] }), 2);
    const fail = (s0: WeightGardenState) => {
      let st = act(s0, { type: 'setLearningRate', value: 0.01 });
      let steps = 0;
      while (!isOver(st) && steps < 200) {
        st = act(st, { type: 'step' });
        steps += 1;
      }
      return { st, steps };
    };
    const a = fail(plain);
    const b = fail(lucky);
    expect(b.steps - a.steps).toBe(plain.budget);
    expect(b.st.revives).toBe(0);
    expect(b.st.fails).toBe(a.st.fails + 1);
  });

  it('settling the last plot wins the game; the outcome carries a learned note in both languages', () => {
    const done = playToEnd(game, 1, parties.full, run(1), 5000);
    expect(done.outcome!.result).toBe('won');
    expect(done.outcome!.learned!.note.en.length).toBeGreaterThan(20);
    expect(done.outcome!.learned!.note.fr.length).toBeGreaterThan(20);
    expect((done.state as WeightGardenState).won).toBe(true);
  });

  it('Forfeit ends the game as fled and keeps the score of what was settled', () => {
    const st = openPlot(start(9, 3), 2);
    const out = engine.outcome(act(st, engine.forfeit!(st)))!;
    expect(out.result).toBe('fled');
    expect(out.score).toBe(scoreOf(st));
    expect(out.score).toBeGreaterThan(0);
    expect(engine.outcome(act(start(), { type: 'forfeit' }))!.score).toBe(0);
  });

  it('a finished game ignores every action', () => {
    const over = act(start(), { type: 'forfeit' });
    expect(act(over, { type: 'setWeight', slot: 0, value: 1 })).toBe(over);
    expect(act(over, { type: 'nextRoom' })).toBe(over);
  });
});

describe('party and buffs', () => {
  const study: Party = { members: [makeMember({ id: 'study', name: 'Ilo', habit: 'study', level: 8, loyalty: 60 })] };

  it('Move adds gradient steps to every Train press', () => {
    const a = openPlot(start(1, 3, parties.starter), 1);
    const b = openPlot(start(1, 3, parties.full), 1);
    const base = roomConfig('train', 3).batch;
    expect(a.batch).toBe(base); // starter vassals have power 8: no bonus
    expect(b.batch).toBeGreaterThan(base);
    expect(act(b, { type: 'step' }).steps - b.steps).toBe(b.batch);
  });

  it('Sleep and the time buff add presses to every try', () => {
    const base = openPlot(start(1, 3, parties.starter), 1).budget;
    expect(openPlot(start(1, 3, parties.full), 1).budget).toBeGreaterThan(base);
    expect(openPlot(start(1, 3, parties.starter, { buffs: [{ id: 't', kind: 'time', amount: 20 }] }), 1).budget).toBe(base + 2);
  });

  it('a Study troop shows the gardener advice; other parties do not', () => {
    expect(start(1, 3, study).showAdvice).toBe(true);
    expect(start(1, 3, parties.starter).showAdvice).toBe(false);
    expect(start(1, 3, parties.full).showAdvice).toBe(true);
  });

  it('troopsUsed names the troops that helped, or the first member when none did', () => {
    expect(engine.outcome(act(start(1, 3, parties.starter), { type: 'forfeit' }))!.troopsUsed).toEqual(['move']);
    expect(engine.outcome(act(start(1, 3, parties.full), { type: 'forfeit' }))!.troopsUsed).toEqual(['move', 'study', 'sleep']);
    const none: Party = { members: [makeMember({ id: 'citizen', name: 'Ada', habit: null, level: 3, loyalty: 10 })] };
    expect(engine.outcome(act(start(1, 3, none), { type: 'forfeit' }))!.troopsUsed).toEqual(['citizen']);
  });

  it('the hint buff reveals a kind learning rate once per hint, and the ghost line on the hand-turned plot', () => {
    const st = start(2, 3, parties.starter, { buffs: [{ id: 'h', kind: 'hint', amount: 2 }] });
    expect(st.hints).toBe(2);
    const hinted = act(st, { type: 'hint' });
    expect(hinted.hints).toBe(1);
    expect(hinted.hintOn).toBe(true);
    expect(act(hinted, { type: 'hint' })).toBe(hinted); // one per plot
    const train = openPlot(st, 1);
    const t2 = act(train, { type: 'hint' });
    expect(t2.lr).toBe(roomConfig('train', 3).goodLr);
    expect(t2.hints).toBe(1);
  });

  it('the luck buff picks the healthiest of several seedlings: it never starts worse, and sometimes better', () => {
    let better = 0;
    for (let s = 1; s <= 30; s++) {
      const plain = openPlot(start(s, 3), 3);
      const lucky = openPlot(start(s, 3, parties.starter, { buffs: [{ id: 'l', kind: 'luck', amount: 20 }] }), 3);
      if (kindOf(plain) !== 'noise' || kindOf(lucky) !== 'noise') continue;
      if (lucky.loss < plain.loss) better += 1;
    }
    expect(better).toBeGreaterThan(0);
  });

  it('attack and defense buffs change nothing', () => {
    const a = start(4, 3);
    const b = start(4, 3, parties.starter, { buffs: [{ id: 'a', kind: 'attack', amount: 30 }, { id: 'd', kind: 'defense', amount: 30 }] });
    expect(b).toEqual(a);
  });
});

describe('score, difficulty, determinism, language', () => {
  it('score is 0 with nothing settled and grows with every plot settled; never above 1000', () => {
    const scores: number[] = [];
    let st = start(1, 3, parties.full);
    scores.push(scoreOf(st));
    for (let i = 0; i < 2000 && !isOver(st); i++) {
      const before = st.cleared.length;
      st = act(st, engine.botPlay(st, () => 0.5)!);
      if (st.cleared.length > before) scores.push(scoreOf(st));
    }
    expect(scores[0]).toBe(0);
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
    expect(Math.max(...scores)).toBeLessThanOrEqual(1000);
    expect(scores[scores.length - 1]!).toBeGreaterThan(700);
  });

  it('difficulty makes plots tighter: fewer presses, higher goals, and the bot wins less', () => {
    const budgets = [1, 2, 3, 4, 5].map((d) => roomConfig('boss', d).budget);
    const goals = [1, 2, 3, 4, 5].map((d) => roomConfig('boss', d).goalPct);
    for (let i = 1; i < 5; i++) {
      expect(budgets[i]!).toBeLessThanOrEqual(budgets[i - 1]!);
      expect(goals[i]!).toBeGreaterThanOrEqual(goals[i - 1]!);
    }
    const wins = (d: RunContext['difficulty']) => {
      let w = 0;
      for (let s = 1; s <= 40; s++) if (playToEnd(game, s, parties.starter, run(d), 5000).outcome!.result === 'won') w += 1;
      return w;
    };
    expect(wins(1)).toBeGreaterThan(wins(3));
    expect(wins(3)).toBeGreaterThan(wins(5));
  });

  it('the same seed replays identically; another seed gives other seeds on the plot', () => {
    const a = playToEnd(game, 11, parties.full, run(3), 5000);
    const b = playToEnd(game, 11, parties.full, run(3), 5000);
    expect(b.actions).toEqual(a.actions);
    expect(b.outcome).toEqual(a.outcome);
    expect(start(11).seeds).toEqual(start(11).seeds);
    expect(start(12).seeds).not.toEqual(start(11).seeds);
  });

  it('the outcome log is written in the player language', () => {
    const en = engine.outcome(act(start(2, 3), { type: 'forfeit' }))!;
    const fr = engine.outcome(act(engine.initial(2, parties.starter, run(3), 'fr'), { type: 'forfeit' }))!;
    expect(en.log.join(' ')).toMatch(/stepped away/);
    expect(fr.log.join(' ')).toMatch(/arrêté/);
  });

  it('the state is plain JSON: it survives a round trip through JSON', () => {
    const st = openPlot(start(3, 3), 3);
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
  });
});

describe('the bot', () => {
  it('clears the first four plots on difficulty 3 for at least 80 percent of 100 seeds', () => {
    let cleared = 0;
    for (let s = 1; s <= 100; s++) {
      const r = playToEnd(game, s, parties.starter, run(3), 5000);
      if (Number(r.outcome!.stats!.plots) >= 4) cleared += 1;
    }
    expect(cleared).toBeGreaterThanOrEqual(80);
  });

  it('wins on difficulty 3 about half the time with a starter party and more with a full one', () => {
    const rate = (party: Party) => {
      let w = 0;
      for (let s = 1; s <= 100; s++) if (playToEnd(game, s, party, run(3), 5000).outcome!.result === 'won') w += 1;
      return w;
    };
    const starter = rate(parties.starter);
    const full = rate(parties.full);
    expect(starter).toBeGreaterThanOrEqual(40);
    expect(starter).toBeLessThanOrEqual(75);
    expect(full).toBeGreaterThan(starter);
    expect(full).toBeLessThanOrEqual(90);
  });

  it('is never stuck: every game of 60 ends within a few hundred actions', () => {
    for (let s = 1; s <= 60; s++) {
      const r = playToEnd(game, s, parties.mixed, run(((s % 5) + 1) as RunContext['difficulty']), 5000);
      expect(r.outcome).not.toBeNull();
      expect(r.steps).toBeLessThan(400);
    }
  });
});

describe('what the gardener says', () => {
  it('reads the situation from the numbers', () => {
    let st = start(1, 3);
    expect(coachFor(st).key).toBe('far');
    st = openPlot(start(2, 3), 1);
    expect(coachFor(st)).toEqual({ kind: 'train', key: 'start' });
    expect(coachFor(act(st, { type: 'setLearningRate', value: 0.01 }, { type: 'step' }, { type: 'step' })).key).toBe('slow');
    expect(coachFor(act(st, { type: 'setLearningRate', value: 3 }, { type: 'step' })).key).toBe('flew');
    st = openPlot(start(2, 3), 2);
    expect(coachFor(st).key).toBe('start');
    expect(coachFor(act(st, { type: 'step' }, { type: 'step' })).key).toBe('stuck');
    st = openPlot(start(2, 3), 3);
    expect(coachFor(st)).toEqual({ kind: 'noise', key: 'start' });
  });

  it('every coach line exists in both languages', async () => {
    const { strings } = await import('./strings');
    for (const lang of ['en', 'fr'] as const) {
      const coach = strings[lang].coach as unknown as Record<string, Record<string, string>>;
      for (const [kind, keys] of [
        ['line', ['far', 'near', 'done']],
        ['train', ['start', 'slow', 'fast', 'jump', 'flew', 'done', 'again']],
        ['xor', ['start', 'stuck', 'few', 'climbing', 'flew', 'done', 'again']],
        ['noise', ['start', 'climbing', 'peak', 'fell', 'flew', 'done', 'again']],
        ['boss', ['start', 'climbing', 'flew', 'done', 'again']],
      ] as const) {
        for (const k of keys) expect(coach[kind]?.[k], `${lang} ${kind}.${k}`).toBeTruthy();
      }
    }
  });
});

describe('percent helpers', () => {
  it('whole percent rounds down, so 95 percent is really 95', () => {
    expect(trainPct({ trainOk: 19, trainN: 20 })).toBe(95);
    expect(trainPct({ trainOk: 18, trainN: 19 })).toBe(94);
    expect(testPct({ testOk: 0, testN: 0 })).toBe(0);
  });
});
