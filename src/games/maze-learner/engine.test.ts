/**
 * Maze Learner's rules: the update rule, the lessons, party and buffs,
 * scoring and the outcomes, determinism and the bot. Statistical claims are
 * asserted over many seeds so a regression in the learner shows up.
 */
import { describe, expect, it } from 'vitest';
import { buffAmount, emptyRun, makeMember, type Party, type RunContext } from '../contract';
import { parties } from '../testing/fixtures';
import { playToEnd } from '../testing/play';
import {
  BUDGET,
  EXIT,
  FAR,
  LEVELS,
  MARK_CHEESE,
  MARK_NONE,
  MARK_PUDDLE,
  NEAR,
  RES_EXIT_WET,
  RES_FAR,
  RES_LOOP,
  RES_NEAR,
  RES_TIMEOUT,
  START,
  TRIES,
  WALL,
  WET,
  BONUS,
  crumbCount,
  engine,
  greedyWalk,
  hasReward,
  idiv,
  initialAt,
  isOver,
  legalDirs,
  outcomeLog,
  policyDir,
  qUpdate,
  valueOf,
  windowRate,
  type MazeAction,
  type MazeState,
} from './engine';
import { neighbor } from './maze';
import game from './manifest';

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const run = (d: 1 | 2 | 3 | 4 | 5 = 2): RunContext => emptyRun(d);
const at = (seed: number, level: number, party: Party = parties.full, r: RunContext = run(2)): MazeState => initialAt(seed, party, r, 'en', level);
const apply = (s: MazeState, ...actions: MazeAction[]): MazeState => actions.reduce((st, a) => engine.reduce(st, a), s);
const find = (s: MazeState, kind: number): number => s.cells.indexOf(kind);
const all = (s: MazeState, kind: number): number[] => s.cells.map((k, i) => (k === kind ? i : -1)).filter((i) => i >= 0);

/** Train in chunks of ten until the lesson is passed, the try ends or `max` episodes were asked for. */
function trainUntil(s: MazeState, max = 400): MazeState {
  let st = s;
  for (let asked = 0; asked < max && !st.passed && !isOver(st); asked += 10) st = engine.reduce(st, { type: 'train', episodes: 10 });
  return st;
}

/** The first lesson of a straight corridor, built by hand: start, four floor tiles, the exit. A cheese on a wall keeps the lesson from ending early. */
function corridorState(extra: Partial<MazeState> = {}): MazeState {
  const base = at(1, 4);
  const cells = [START, 1, 1, 1, 1, EXIT, WALL];
  const marks = [0, 0, 0, 0, 0, MARK_CHEESE, MARK_CHEESE];
  return { ...base, width: 7, height: 1, cells, marks, q: cells.flatMap(() => [0, 0, 0, 0]), visits: cells.map(() => 0), route: [0], recent: [], epsilon: 500, discount: 800, alpha: 500, budget: 100000, ...extra };
}

describe('the update rule (fixed-point Q-learning)', () => {
  const g = { width: 3, height: 1, cells: [START, 1, EXIT] };
  const zeros = () => Array.from({ length: 12 }, () => 0);

  it('moves a value a fraction alpha of the way to reward + gamma x best next value', () => {
    const q = zeros();
    qUpdate(q, 1, 1, 10, 2, true, 500, 800, g);
    expect(q[1 * 4 + 1]).toBe(5000);
    qUpdate(q, 1, 1, 10, 2, true, 500, 800, g);
    expect(q[1 * 4 + 1]).toBe(7500);
    // Not terminal: tile 0 -> 1 bootstraps on the best value of tile 1 (7500), discounted by 0.8.
    qUpdate(q, 0, 1, 0, 1, false, 500, 800, g);
    expect(q[0 * 4 + 1]).toBe(3000);
  });

  it('truncates toward zero, so a penalty and a reward of the same size are mirror images', () => {
    const up = zeros();
    const down = zeros();
    qUpdate(up, 1, 1, 7, 2, true, 333, 900, g);
    qUpdate(down, 1, 1, -7, 2, true, 333, 900, g);
    expect(up[5]).toBe(2331);
    expect(down[5]).toBe(-2331);
    expect(idiv(-7, 2)).toBe(-3);
    expect(idiv(7, 2)).toBe(3);
  });

  it('a terminal move does not bootstrap, a discount of zero ignores the future', () => {
    const q = zeros();
    q[1 * 4 + 1] = 9000;
    qUpdate(q, 0, 1, 0, 1, false, 1000, 0, g);
    expect(q[0 * 4 + 1]).toBe(0);
    qUpdate(q, 0, 1, 0, 1, false, 1000, 800, g);
    expect(q[0 * 4 + 1]).toBe(7200);
  });

  it('the best value of a tile only counts moves that exist', () => {
    const q = zeros();
    q[0 * 4 + 0] = 99999; // "up" from tile 0 is off the grid
    q[0 * 4 + 1] = 40;
    expect(legalDirs(g, 0)).toEqual([1]);
    expect(valueOf(g, q, 0)).toBe(40);
    expect(policyDir(g, q, 0)).toBe(1);
    expect(policyDir(g, zeros(), 0)).toBe(-1);
  });

  it('converges to reward x gamma^distance along a corridor', () => {
    let s = corridorState();
    for (let k = 0; k < 12; k++) s = engine.reduce(s, { type: 'train', episodes: 20 });
    for (let tile = 0; tile < 5; tile++) {
      const want = 10000 * 0.8 ** (4 - tile);
      expect(Math.abs((s.q[tile * 4 + 1] ?? 0) - want) / want, `tile ${tile}`).toBeLessThan(0.02);
    }
    // And the arrows all point toward the exit.
    for (let tile = 0; tile < 5; tile++) expect(policyDir(s, s.q, tile)).toBe(1);
  });

  it('a discount of zero values only the tile next to the exit; a higher one reaches farther back', () => {
    let low = corridorState({ discount: 0 });
    let high = corridorState({ discount: 900 });
    for (let k = 0; k < 8; k++) {
      low = engine.reduce(low, { type: 'train', episodes: 20 });
      high = engine.reduce(high, { type: 'train', episodes: 20 });
    }
    expect(valueOf(low, low.q, 4)).toBeGreaterThan(9000);
    expect(valueOf(low, low.q, 3)).toBe(0);
    expect(valueOf(high, high.q, 1)).toBeGreaterThan(5000);
  });

  it('values stay whole numbers and finite across a thousand episodes', () => {
    let s = at(7, 2);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'placePenalty', cell: find(s, WET) });
    for (let k = 0; k < 10; k++) s = engine.reduce(s, { type: 'train', episodes: 100 });
    expect(s.q.every((v) => Number.isInteger(v))).toBe(true);
    expect(s.q.some((v) => v !== 0)).toBe(true);
  });
});

describe('lesson 1: first lesson', () => {
  it('opens with nothing to learn from: training without a reward does nothing but say so', () => {
    const s = at(3, 1);
    expect(hasReward(s)).toBe(false);
    const t = engine.reduce(s, { type: 'train', episodes: 10 });
    expect(t.episodes).toBe(0);
    expect(t.q).toEqual(s.q);
    expect(t.feed[t.feed.length - 1]?.k).toBeGreaterThan(0);
  });

  it('the learner reaches the exit within the budget for 100 seeds, with a first-time party on the gentlest difficulty', () => {
    let firstTry = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 1, parties.starter, run(1));
      s = apply(s, { type: 'placeReward', cell: find(s, EXIT) });
      s = trainUntil(s);
      expect(s.passed, `seed ${seed}`).toBe(true);
      if (s.triesLeft === TRIES) firstTry += 1;
      expect(s.episodes).toBeLessThanOrEqual(s.budget);
      expect(greedyWalk(s).end, `seed ${seed}`).toBe(EXIT);
    }
    expect(firstTry).toBeGreaterThanOrEqual(95);
  });

  it('the arrows only appear where something was learned', () => {
    const s = at(4, 1);
    for (let i = 0; i < s.cells.length; i++) expect(policyDir(s, s.q, i)).toBe(-1);
    const t = trainUntil(apply(s, { type: 'placeReward', cell: find(s, EXIT) }));
    expect(greedyWalk(t).path.length).toBeGreaterThan(2);
  });

  it('changing a reward restarts the success score, changing a setting does not', () => {
    let s = at(5, 1);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'train', episodes: 6 });
    expect(s.recent.length).toBeGreaterThan(0);
    const same = apply(s, { type: 'setEpsilon', value: 300 });
    expect(same.recent).toEqual(s.recent);
    const changed = apply(s, { type: 'placePenalty', cell: find(s, START) });
    expect(changed.recent).toEqual([]);
    expect(changed.q).toEqual(s.q);
  });
});

describe('lesson 2: traps', () => {
  it('without a penalty the creature takes the wet shortcut, and the lesson is almost never passed', () => {
    let crossed = 0;
    let passed = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 2);
      s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'setEpsilon', value: 50 });
      s = trainUntil(s, 60);
      if (s.passed) passed += 1;
      if (s.recent.filter((r) => r === RES_EXIT_WET).length >= s.recent.length / 2) crossed += 1;
    }
    expect(crossed).toBeGreaterThanOrEqual(75);
    expect(passed).toBeLessThanOrEqual(15);
  });

  it('with a puddle on every wet tile it learns to stay dry and passes', () => {
    let passed = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 2);
      s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, ...all(s, WET).map((cell) => ({ type: 'placePenalty', cell }) as MazeAction));
      s = apply(s, { type: 'setEpsilon', value: 250 });
      s = trainUntil(s, 60);
      s = apply(s, { type: 'setEpsilon', value: 60 });
      s = trainUntil(s, s.budget);
      if (s.passed) {
        passed += 1;
        expect(greedyWalk(s).path.some((i) => s.cells[i] === WET)).toBe(false);
        expect(windowRate(s)).toBeGreaterThanOrEqual(90);
      }
    }
    expect(passed).toBeGreaterThanOrEqual(80);
  });

  it('a penalty in the wrong place teaches nothing about the wet floor', () => {
    let s = at(8, 2);
    const floor = s.cells.findIndex((k, i) => k === 1 && i !== find(s, START));
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'placePenalty', cell: floor }, { type: 'setEpsilon', value: 50 });
    s = trainUntil(s, 60);
    expect(s.passed).toBe(false);
  });

  it('stepping on wet floor is never counted as a success, whatever the reward', () => {
    let s = at(2, 2);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'setEpsilon', value: 0 });
    s = trainUntil(s, 40);
    expect(s.recent.every((r) => r === RES_EXIT_WET || r === RES_TIMEOUT || r === 1)).toBe(true);
    expect(windowRate(s)).toBeLessThan(90);
  });
});

describe('lesson 3: explore or exploit', () => {
  const farHits = (s: MazeState, n = 30) => s.recent.slice(-n).filter((r) => r === RES_FAR).length;

  it('the exits and their rewards are part of the lesson: they cannot be changed', () => {
    const s = at(1, 3);
    for (const cell of [find(s, NEAR), find(s, FAR)]) {
      const t = apply(s, { type: 'erase', cell }, { type: 'placePenalty', cell });
      expect(t.marks).toEqual(s.marks);
    }
    expect(hasReward(s)).toBe(true);
  });

  it('with epsilon at zero it settles for the near cheese and does not find the far one', () => {
    let stuck = 0;
    let passed = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 3);
      s = apply(s, { type: 'setEpsilon', value: 0 });
      s = trainUntil(s, 100);
      if (s.passed) passed += 1;
      if (farHits(s, 30) === 0 && s.recent.slice(-10).every((r) => r === RES_NEAR)) stuck += 1;
    }
    expect(stuck).toBeGreaterThanOrEqual(70);
    expect(passed).toBeLessThanOrEqual(20);
  });

  it('a lot of exploring and then settling finds the far cheese and keeps taking it', () => {
    let passed = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 3, parties.full, run(1));
      s = apply(s, { type: 'setEpsilon', value: 700 });
      for (let k = 0; k < 20 && !s.passed && !isOver(s); k++) {
        s = engine.reduce(s, { type: 'train', episodes: 10 });
        if (farHits(s, 20) >= 5 && s.epsilon > 80) s = engine.reduce(s, { type: 'setEpsilon', value: 80 });
      }
      if (s.passed) {
        passed += 1;
        expect(greedyWalk(s).end).toBe(FAR);
      }
    }
    expect(passed).toBeGreaterThanOrEqual(80);
  });

  it('too much exploring never settles: with epsilon at the maximum the lesson is not passed', () => {
    let passed = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 3, parties.full, run(1));
      s = apply(s, { type: 'setEpsilon', value: 1000 });
      s = trainUntil(s, 150);
      if (s.passed) passed += 1;
    }
    expect(passed).toBeLessThanOrEqual(5);
  });

  it('the companion (a Social vassal) explores a lot and is reported next to the player', () => {
    const social = makeMember({ id: 'social', name: 'Pell', habit: 'social', level: 3, loyalty: 50 });
    const withFriend: Party = { members: [social] };
    let s = at(6, 3, withFriend);
    expect(s.q2.length).toBe(s.q.length);
    s = apply(s, { type: 'train', episodes: 30 });
    expect(s.friendEpisodes).toBe(30);
    expect(at(6, 3, parties.starter).q2).toEqual([]);
    expect(at(6, 2, withFriend).q2).toEqual([]);
  });
});

describe('lesson 4: reward shaping', () => {
  const exits = (s: MazeState) => s.recent.filter((r) => r === 1).length;
  it('a single reward at the end of the corridor is almost never found, so nothing is learned', () => {
    let total = 0;
    let lucky = 0;
    let passedByLuck = 0;
    for (const seed of SEEDS.slice(0, 60)) {
      let s = at(seed, 4);
      s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'setEpsilon', value: 400 });
      s = apply(s, { type: 'train', episodes: 60 });
      const found = s.episodes > 0 ? exits(s) : 0;
      total += found;
      if (found > 0) lucky += 1;
      if (s.passed) passedByLuck += 1;
    }
    expect(total / 60).toBeLessThan(1.5);
    expect(lucky).toBeLessThan(15);
    expect(passedByLuck).toBeLessThanOrEqual(2);
  });

  it('a trail of breadcrumbs lets it learn, but the lesson is not passed while crumbs are left', () => {
    let learned = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      let s = at(seed, 4);
      // The bot lays the trail on its first moves.
      for (let guard = 0; guard < 60; guard++) {
        const a = engine.botPlay(s, () => 0.5);
        if (!a || a.type === 'train' || a.type === 'setEpsilon') break;
        s = engine.reduce(s, a);
      }
      expect(crumbCount(s)).toBeGreaterThan(5);
      s = apply(s, { type: 'setEpsilon', value: 400 });
      s = trainUntil(s, 44);
      if (windowRate(s) >= 80) {
        learned += 1;
        expect(s.passed, 'crumbs are still on the board').toBe(false);
        expect(s.feed.some((e) => e.k === 12)).toBe(true);
      }
    }
    expect(learned).toBeGreaterThan(5);
  });

  it('after the breadcrumbs are taken away it still reaches the exit, and the lesson is passed', () => {
    let passed = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      let s = at(seed, 4, parties.full, run(1));
      for (let guard = 0; guard < 400 && !s.passed && !isOver(s); guard++) {
        const a = engine.botPlay(s, () => 0.5);
        if (!a) break;
        s = engine.reduce(s, a);
      }
      if (s.passed) {
        passed += 1;
        expect(crumbCount(s)).toBe(0);
        expect(greedyWalk(s).end).toBe(EXIT);
      }
    }
    expect(passed).toBeGreaterThanOrEqual(32);
  });
});

describe('lesson 5: reward hack', () => {
  it('the loophole is real: with the bonus tile rewarded the creature loops on it and never exits', () => {
    let looping = 0;
    for (const seed of SEEDS) {
      let s = at(seed, 5);
      expect(s.marks[find(s, BONUS)]).toBe(MARK_CHEESE);
      s = apply(s, { type: 'setEpsilon', value: 100 });
      s = trainUntil(s, 40);
      expect(s.passed, `seed ${seed}`).toBe(false);
      if (s.recent.slice(-10).filter((r) => r === RES_LOOP).length >= 7) looping += 1;
    }
    expect(looping).toBeGreaterThanOrEqual(85);
  });

  it('the loop pays more than the way out, which is why it wins', () => {
    let s = at(3, 5);
    s = apply(s, { type: 'setEpsilon', value: 100 });
    s = trainUntil(s, 40);
    const bonus = find(s, BONUS);
    const start = find(s, START);
    const toward = [0, 1, 2, 3].find((d) => neighbor(s.width, s.height, start, d) === bonus) ?? 0;
    expect(s.q[start * 4 + toward]).toBeGreaterThan(10000 * 0.8 ** 12 * 3);
    expect(policyDir(s, s.q, start)).toBe(toward);
  });

  it('fixing the rewards fixes the behaviour: take the bonus reward away (or turn it into a penalty) and it exits', () => {
    for (const fix of ['erase', 'placePenalty'] as const) {
      let passed = 0;
      for (const seed of SEEDS) {
        let s = at(seed, 5);
        s = apply(s, { type: 'setEpsilon', value: 100 });
        s = trainUntil(s, 10);
        s = apply(s, { type: fix, cell: find(s, BONUS) });
        s = trainUntil(s, s.budget);
        if (s.passed) {
          passed += 1;
          expect(greedyWalk(s).end).toBe(EXIT);
        }
      }
      expect(passed, fix).toBeGreaterThanOrEqual(90);
    }
  });

  it('passing the last lesson wins the game', () => {
    let s = at(2, 5);
    s = apply(s, { type: 'erase', cell: find(s, BONUS) });
    s = trainUntil(s, s.budget);
    expect(s.passed).toBe(true);
    expect(isOver(s)).toBe(true);
    expect(engine.outcome(s)?.result).toBe('won');
  });
});

describe('actions', () => {
  it('place and erase only work on open tiles, inside the maze, and say so', () => {
    const s = at(1, 1);
    const wall = s.cells.indexOf(WALL);
    for (const cell of [wall, -1, s.cells.length, 1.5, Number.NaN]) {
      expect(apply(s, { type: 'placeReward', cell })).toBe(s);
      expect(apply(s, { type: 'placePenalty', cell })).toBe(s);
      expect(apply(s, { type: 'erase', cell })).toBe(s);
    }
    const exit = find(s, EXIT);
    const placed = apply(s, { type: 'placeReward', cell: exit });
    expect(placed.marks[exit]).toBe(MARK_CHEESE);
    expect(apply(placed, { type: 'placeReward', cell: exit })).toBe(placed);
    expect(apply(placed, { type: 'placePenalty', cell: exit }).marks[exit]).toBe(MARK_PUDDLE);
    expect(apply(placed, { type: 'erase', cell: exit }).marks[exit]).toBe(MARK_NONE);
  });

  it('epsilon and the discount are clamped, and rubbish is ignored', () => {
    const s = at(1, 1);
    expect(apply(s, { type: 'setEpsilon', value: 5000 }).epsilon).toBe(1000);
    expect(apply(s, { type: 'setEpsilon', value: -3 }).epsilon).toBe(0);
    expect(apply(s, { type: 'setDiscount', value: 5000 }).discount).toBe(990);
    expect(apply(s, { type: 'setDiscount', value: 333.9 }).discount).toBe(333);
    expect(apply(s, { type: 'setEpsilon', value: Number.NaN })).toBe(s);
    expect(apply(s, { type: 'train', episodes: Number.NaN })).toBe(s);
    expect(apply(s, { type: 'nextLevel' })).toBe(s);
  });

  it('train runs a bounded number of episodes, and stops the moment the lesson is passed', () => {
    let s = at(10, 1);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) });
    const huge = engine.reduce(s, { type: 'train', episodes: 100000 });
    expect(huge.episodes).toBeLessThanOrEqual(100);
    expect(huge.passed).toBe(true);
    expect(huge.episodes).toBeGreaterThanOrEqual(10);
    expect(engine.reduce(huge, { type: 'train', episodes: 5 })).toBe(huge);
    expect(apply(huge, { type: 'placePenalty', cell: find(s, START) })).toBe(huge);
  });

  it('forgetting empties the learner but keeps your rewards, and does not give back the episodes already spent', () => {
    let s = at(11, 5);
    s = apply(s, { type: 'erase', cell: find(s, BONUS) }, { type: 'train', episodes: 10 });
    const spent = s.episodes;
    const f = apply(s, { type: 'reset' });
    expect(f.q.every((v) => v === 0)).toBe(true);
    expect(f.visits.every((v) => v === 0)).toBe(true);
    expect(f.recent).toEqual([]);
    expect(f.episodes).toBe(spent);
    expect(f.marks).toEqual(s.marks);
    expect(f.marks[find(f, BONUS)]).toBe(MARK_NONE);
  });

  it('next lesson only after a pass, and it opens a fresh maze with a new budget', () => {
    let s = at(12, 1);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) });
    s = trainUntil(s);
    expect(s.passed).toBe(true);
    const n = apply(s, { type: 'nextLevel' });
    expect(n.level).toBe(2);
    expect(n.passed).toBe(false);
    expect(n.episodes).toBe(0);
    expect(n.q.every((v) => v === 0)).toBe(true);
    expect(n.cleared).toBe(1);
    expect(n.triesLeft).toBe(TRIES);
  });
});

describe('tries, loss, leaving', () => {
  const burn = (s: MazeState): MazeState => {
    let st = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'setEpsilon', value: 1000 });
    st = apply(st, { type: 'placePenalty', cell: find(st, START) });
    for (let k = 0; k < 40 && !isOver(st); k++) st = engine.reduce(st, { type: 'train', episodes: 100 });
    return st;
  };

  it('running out of episodes costs a try: the creature forgets, the rewards stay', () => {
    let s = at(1, 4, parties.starter, run(3));
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'setEpsilon', value: 400 });
    s = { ...s, budget: 30 };
    const one = engine.reduce(s, { type: 'train', episodes: 100 });
    // The first try ended exactly at the budget and was wiped.
    expect(one.triesLeft).toBe(TRIES - 1);
    expect(one.failedTries).toBe(1);
    expect(one.episodes).toBe(0);
    expect(one.q.every((v) => v === 0)).toBe(true);
    expect(one.recent).toEqual([]);
    expect(one.totalEpisodes).toBe(30);
    expect(one.marks[find(one, EXIT)]).toBe(MARK_CHEESE);
    expect(one.feed[one.feed.length - 1]?.k).toBe(6);
    const two = engine.reduce(one, { type: 'train', episodes: 100 });
    expect(two.triesLeft).toBe(TRIES - 2);
    expect(two.totalEpisodes).toBe(60);
  });

  it('after three tries on one lesson the game is lost, with the troops coming home', () => {
    const s = burn(at(5, 4, parties.starter, run(4)));
    expect(s.lost).toBe(true);
    expect(s.triesLeft).toBe(0);
    const o = engine.outcome(s)!;
    expect(o.result).toBe('lost');
    expect(o.score).toBeGreaterThanOrEqual(0);
    expect(o.log[o.log.length - 1]).toMatch(/Ran out of tries in lesson 4/);
    expect(engine.reduce(s, { type: 'train', episodes: 10 })).toBe(s);
    expect(engine.botPlay(s, () => 0)).toBeNull();
  });

  it('forfeiting ends as fled with the partial score and keeps what was learned', () => {
    let s = at(6, 1);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) });
    s = trainUntil(s);
    s = apply(s, { type: 'nextLevel' }, { type: 'forfeit' });
    const o = engine.outcome(s)!;
    expect(o.result).toBe('fled');
    expect(o.score).toBeGreaterThan(100);
    expect(o.learned?.topic.en).toBe('Trial and error');
    expect(o.log.join(' ')).toMatch(/Stepped away during lesson 2/);
    expect(engine.forfeit?.(s)).toEqual({ type: 'forfeit' });
  });

  it('forfeiting before any lesson is passed scores almost nothing and claims no lesson learned', () => {
    const o = engine.outcome(apply(at(7, 1), { type: 'forfeit' }))!;
    expect(o.result).toBe('fled');
    expect(o.score).toBeLessThan(10);
    expect(o.learned).toBeUndefined();
  });
});

describe('score and outcome', () => {
  const won = (seed: number, d: 1 | 2 | 3 | 4 | 5 = 1) => playToEnd(game, seed, parties.full, run(d)).outcome!;

  it('a won game scores high, an unfinished one lower, and the score is a whole number from 0 to 1000', () => {
    const o = won(1);
    expect(o.result).toBe('won');
    expect(o.score).toBeGreaterThanOrEqual(700);
    expect(o.score).toBeLessThanOrEqual(1000);
    expect(Number.isInteger(o.score)).toBe(true);
    const half = engine.outcome(apply(at(1, 3), { type: 'forfeit' }))!;
    expect(half.score).toBeLessThan(o.score);
  });

  it('every lesson passed adds to the score, a failed try takes a little away', () => {
    const base = at(2, 3);
    const two = engine.outcome({ ...base, forfeited: true, spent: [20, 30], budgets: [50, 50], cleared: 2 })!;
    const one = engine.outcome({ ...base, forfeited: true, spent: [20], budgets: [50], cleared: 1 })!;
    const penalised = engine.outcome({ ...base, forfeited: true, spent: [20, 30], budgets: [50, 50], cleared: 2, failedTries: 2 })!;
    expect(two.score).toBeGreaterThan(one.score);
    expect(penalised.score).toBe(two.score - 20);
  });

  it('finishing with episodes to spare scores better than scraping through', () => {
    const base = at(2, 3);
    const quick = engine.outcome({ ...base, forfeited: true, spent: [10], budgets: [50], cleared: 1 })!;
    const slow = engine.outcome({ ...base, forfeited: true, spent: [50], budgets: [50], cleared: 1 })!;
    expect(quick.score).toBeGreaterThan(slow.score);
  });

  it('the outcome log is in the player language and lists every lesson passed', () => {
    const en = playToEnd(game, 3, parties.full, run(1), 20000, { locale: 'en' }).outcome!;
    const fr = playToEnd(game, 3, parties.full, run(1), 20000, { locale: 'fr' }).outcome!;
    expect(en.log).toHaveLength(7);
    expect(fr.log).toHaveLength(7);
    expect(en.log[1]).toMatch(/^Lesson 1, First lesson: passed in \d+ of \d+ episodes\.$/);
    expect(fr.log[1]).toMatch(/^Leçon 1, Première leçon : réussie en \d+ épisodes sur \d+\.$/);
    expect(en.learned?.topic).toEqual({ en: 'Reward hacking', fr: 'Détournement de récompense' });
    expect(en.score).toBe(fr.score);
    expect(outcomeLog(at(1, 1))[0]).toMatch(/learner waits/);
  });

  it('names the troops that took part', () => {
    const o = engine.outcome(apply(at(1, 1, parties.mixed), { type: 'forfeit' }))!;
    expect(o.troopsUsed).toEqual(parties.mixed.members.map((m) => m.id));
  });
});

describe('difficulty', () => {
  it('shrinks the episode budget of every lesson as it rises', () => {
    for (let level = 1; level <= LEVELS; level++) {
      const budgets = [1, 2, 3, 4, 5].map((d) => at(1, level, parties.starter, run(d as 1 | 2 | 3 | 4 | 5)).budget);
      for (let k = 1; k < 5; k++) expect(budgets[k]!, `lesson ${level}`).toBeLessThan(budgets[k - 1]!);
    }
    expect(BUDGET).toHaveLength(LEVELS);
  });

  it('adds slippery steps from difficulty 4: with nothing left to learn and no exploring, calm levels repeat one route and slippery ones do not', () => {
    let trained = at(3, 1, parties.full, run(1));
    trained = apply(trained, { type: 'placeReward', cell: find(trained, EXIT) });
    trained = trainUntil(trained);
    expect(trained.passed).toBe(true);
    const routes = (d: 1 | 2 | 3 | 4 | 5) => {
      const frozen: MazeState = { ...trained, difficulty: d, passed: false, recent: [], epsilon: 0, alpha: 0, budget: 100000 };
      const seen = new Set<string>();
      let s = frozen;
      for (let k = 0; k < 60; k++) {
        s = engine.reduce({ ...s, passed: false, recent: [] }, { type: 'train', episodes: 1 });
        seen.add(s.route.join(','));
      }
      return seen.size;
    };
    expect(routes(1)).toBe(1);
    expect(routes(3)).toBe(1);
    expect(routes(5)).toBeGreaterThan(3);
  });

  it('is gentle on a first-time party at difficulty 1 and harsh at difficulty 5', () => {
    const wins = (party: Party, d: 1 | 2 | 3 | 4 | 5) => SEEDS.slice(0, 40).filter((seed) => playToEnd(game, seed, party, run(d)).outcome?.result === 'won').length;
    expect(wins(parties.starter, 1)).toBeGreaterThanOrEqual(20);
    expect(wins(parties.full, 5)).toBeLessThan(wins(parties.full, 3));
    expect(wins(parties.full, 3)).toBeLessThan(wins(parties.full, 1));
  });
});

describe('party and buffs', () => {
  it('a stronger party learns faster (alpha) and has more episodes (two per member)', () => {
    const strong = at(1, 1, parties.full);
    const weak = at(1, 1, parties.starter);
    expect(strong.alpha).toBeGreaterThan(weak.alpha);
    expect(strong.budget - weak.budget).toBe(2 * (8 - 3));
    const single = at(1, 1, parties.single);
    expect(single.budget).toBe(weak.budget - 2 * 2);
  });

  it('the habits unlock perks: Move, Study, Social, Sleep', () => {
    const only = (habit: 'move' | 'study' | 'social' | 'sleep' | 'eat') =>
      at(1, 3, { members: [makeMember({ id: habit, name: habit, habit, level: 5, loyalty: 50 })] });
    expect(only('move').perkMove).toBe(true);
    expect(only('study').perkStudy).toBe(true);
    expect(only('social').perkSocial).toBe(true);
    expect(only('sleep').perkSleep).toBe(true);
    const eat = only('eat');
    expect([eat.perkMove, eat.perkStudy, eat.perkSocial, eat.perkSleep]).toEqual([false, false, false, false]);
    expect(only('move').alpha).toBe(only('eat').alpha + 30);
  });

  it('Sleep replays each episode, so the same lessons are learned in fewer episodes', () => {
    const dreamer = makeMember({ id: 'sleep', name: 'Mo', habit: 'sleep', level: 5, loyalty: 50 });
    const plain = makeMember({ id: 'eat', name: 'Mo', habit: 'eat', level: 5, loyalty: 50 });
    let faster = 0;
    for (const seed of SEEDS.slice(0, 30)) {
      const used = (m: typeof dreamer) => {
        let s = at(seed, 1, { members: [m] }, run(1));
        s = apply(s, { type: 'placeReward', cell: find(s, EXIT) });
        return trainUntil(s).episodes;
      };
      if (used(dreamer) < used(plain)) faster += 1;
    }
    expect(faster).toBeGreaterThanOrEqual(15);
  });

  it('time adds one episode per two seconds to every lesson', () => {
    const timed: RunContext = { ...run(2), buffs: [{ id: 't', kind: 'time', amount: 20 }] };
    for (let level = 1; level <= LEVELS; level++) expect(at(1, level, parties.full, timed).budget - at(1, level).budget).toBe(10);
    expect(buffAmount(timed, 'time')).toBe(20);
  });

  it('hint marks a tile the lesson is about, as many as the buff counts', () => {
    const hinted = (n: number): RunContext => ({ ...run(2), buffs: [{ id: 'h', kind: 'hint', amount: n }] });
    expect(at(1, 1).hints).toEqual([]);
    const l1 = at(1, 1, parties.full, hinted(2));
    expect(l1.hints).toEqual([find(l1, EXIT)]);
    const l2 = at(1, 2, parties.full, hinted(1));
    expect(l2.cells[l2.hints[0] ?? 0]).toBe(WET);
    const l3 = at(1, 3, parties.full, hinted(1));
    expect(l3.hints).toEqual([find(l3, FAR)]);
    const l4 = at(1, 4, parties.full, hinted(3));
    expect(l4.hints).toHaveLength(3);
    const l5 = at(1, 5, parties.full, hinted(1));
    expect(l5.hints).toEqual([find(l5, BONUS)]);
  });

  it('luck nudges the first episodes toward a goal, so the first lesson starts faster', () => {
    const lucky: RunContext = { ...run(2), buffs: [{ id: 'l', kind: 'luck', amount: 100 }] };
    let withLuck = 0;
    let without = 0;
    for (const seed of SEEDS.slice(0, 50)) {
      const first = (r: RunContext) => {
        let s = at(seed, 1, parties.full, r);
        s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'train', episodes: 1 });
        return s.recent[0] === 1 ? 1 : 0;
      };
      withLuck += first(lucky);
      without += first(run(2));
    }
    expect(withLuck).toBe(50);
    expect(without).toBeLessThan(25);
  });

  it('attack, defense and revive change nothing', () => {
    const noise: RunContext = { ...run(2), buffs: [{ id: 'a', kind: 'attack', amount: 40 }, { id: 'd', kind: 'defense', amount: 40 }, { id: 'r', kind: 'revive', amount: 3 }] };
    expect(at(4, 2, parties.full, noise)).toEqual(at(4, 2, parties.full, run(2)));
  });
});

describe('determinism', () => {
  const finalState = (seed: number) => {
    let s = at(seed, 2);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'placePenalty', cell: find(s, WET) });
    for (let k = 0; k < 12; k++) s = engine.reduce(s, { type: 'train', episodes: 100 });
    return s;
  };

  it('a thousand episodes replay identically from the same seed', () => {
    expect(JSON.stringify(finalState(21))).toBe(JSON.stringify(finalState(21)));
    expect(finalState(21).totalEpisodes).toBeGreaterThan(30);
  });

  it('different seeds are different games', () => {
    const states = new Set(SEEDS.slice(0, 10).map((s) => JSON.stringify(finalState(s).q)));
    expect(states.size).toBeGreaterThan(6);
  });

  it('training in chunks of ten or in one go of a hundred gives the same learner (the rng follows the episode, not the call)', () => {
    let a = at(5, 3, parties.full, run(1));
    let b = at(5, 3, parties.full, run(1));
    a = apply(a, { type: 'setEpsilon', value: 900 });
    b = apply(b, { type: 'setEpsilon', value: 900 });
    a = { ...a, budget: 100000 };
    b = { ...b, budget: 100000 };
    for (let k = 0; k < 4; k++) a = engine.reduce(a, { type: 'train', episodes: 10 });
    b = engine.reduce(b, { type: 'train', episodes: 40 });
    expect(a.q).toEqual(b.q);
    expect(a.recent).toEqual(b.recent);
  });

  it('the language only changes the words, never the learning', () => {
    const en = playToEnd(game, 8, parties.full, run(2), 20000, { locale: 'en' });
    const fr = playToEnd(game, 8, parties.full, run(2), 20000, { locale: 'fr' });
    expect(fr.actions).toEqual(en.actions);
    expect(fr.outcome?.score).toBe(en.outcome?.score);
    expect(fr.outcome?.log).not.toEqual(en.outcome?.log);
  });

  it('never mutates its input', () => {
    const s = at(9, 2);
    const copy = JSON.stringify(s);
    engine.reduce(s, { type: 'train', episodes: 20 });
    apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'reset' });
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('the bot', () => {
  it('always ends, never wastes an action, and wins about half of the games on the normal difficulty', () => {
    let wins = 0;
    for (const seed of SEEDS) {
      let s = engine.initial(seed, parties.full, run(3), 'en');
      let steps = 0;
      for (;;) {
        const a = engine.botPlay(s, () => 0.5);
        if (a === null) break;
        const n = engine.reduce(s, a);
        expect(n, `seed ${seed} step ${steps}: ${JSON.stringify(a)}`).not.toBe(s);
        s = n;
        if (++steps > 20000) throw new Error('the bot never ended');
      }
      expect(isOver(s)).toBe(true);
      if (engine.outcome(s)?.result === 'won') wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(40);
    expect(wins).toBeLessThanOrEqual(70);
  });

  it('plays every lesson the way a sensible teacher would', () => {
    const l1 = at(1, 1);
    expect(engine.botPlay(l1, () => 0)).toEqual({ type: 'placeReward', cell: find(l1, EXIT) });
    const l2 = at(1, 2);
    const first = engine.botPlay(apply(l2, { type: 'placeReward', cell: find(l2, EXIT) }), () => 0);
    expect(first).toEqual({ type: 'placePenalty', cell: find(l2, WET) });
    const l5 = at(1, 5);
    expect(engine.botPlay(l5, () => 0)).toEqual({ type: 'erase', cell: find(l5, BONUS) });
    const l3 = at(1, 3);
    expect(engine.botPlay(l3, () => 0)).toEqual({ type: 'setEpsilon', value: 700 });
  });

  it('has a bounded game length and a state that stays plain data', () => {
    const r = playToEnd(game, 4, parties.full, run(5), 20000, { freeze: true });
    expect(r.outcome).not.toBeNull();
    expect(r.steps).toBeLessThan(2000);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });
});

describe('the board model', () => {
  it('every wall refuses the creature: it never stands on one', () => {
    let s = at(13, 2);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'train', episodes: 40 });
    for (const tile of s.route) expect(s.cells[tile]).not.toBe(WALL);
    for (let i = 0; i < s.cells.length; i++) if (s.cells[i] === WALL) expect(s.visits[i]).toBe(0);
  });

  it('visits add up: every step lands on a tile', () => {
    let s = at(14, 1);
    s = apply(s, { type: 'placeReward', cell: find(s, EXIT) }, { type: 'train', episodes: 5 });
    expect(s.visits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(5);
  });
});
