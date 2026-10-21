/**
 * Sudoku's own rules: the generator (unique solutions, honest grades, bounded
 * work), the solver, play actions, scoring, perks, buffs and the bot.
 */
import { describe, expect, it } from 'vitest';
import { emptyRun, makeMember, type Party, type RunContext } from '../contract';
import { parties, playToEnd, runs } from '../testing/contract';
import {
  BOT_PACE_PERCENT,
  PAR_SECONDS,
  SCORE,
  checkCost,
  conflictsOf,
  engine,
  filledRight,
  formatTime,
  gradeFor,
  hintCost,
  isOver,
  isSolved,
  scoreOf,
  sizeFor,
  speedBonus,
  topTechnique,
  wrongCells,
  type Difficulty,
  type SudokuAction,
  type SudokuState,
} from './engine';
import { CLUE_FLOOR, MAX_ATTEMPTS, OPS_CAP, addLuckClues, generate } from './generator';
import { conflictCells, emptyCount, geoFor, isValidComplete, remainingPerDigit } from './grid';
import game from './manifest';
import { GRADE_RANK, countSolutions, gradeOfPuzzle, logicSolve, nextStep, solveUnique, type Grade } from './logic';

const SEEDS = 200;

function start(seed: number, difficulty: Difficulty = 3, party: Party = parties.starter, run: Partial<RunContext> = {}): SudokuState {
  return engine.initial(seed, party, { ...emptyRun(difficulty), ...run }, 'en');
}
const act = (s: SudokuState, ...actions: SudokuAction[]) => actions.reduce((st, a) => engine.reduce(st, a), s);
const blank = (s: SudokuState, k = 0) => s.grid.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)[k]!;
const right = (s: SudokuState, cell: number): SudokuAction => ({ type: 'place', cell, digit: s.solution[cell]! });
const wrong = (s: SudokuState, cell: number): SudokuAction => ({ type: 'place', cell, digit: (s.solution[cell]! % s.n) + 1 });
const member = (habit: 'study' | 'sleep' | 'clean' | 'social' | 'hygiene' | 'move', level = 12): Party => ({
  members: [makeMember({ id: habit, name: habit.toUpperCase(), habit, level, loyalty: 80 })],
});

describe('generator: unique solutions and honest grades', () => {
  const tiers: { n: 6 | 9; grade: Grade }[] = [
    { n: 6, grade: 'easy' },
    { n: 6, grade: 'medium' },
    { n: 9, grade: 'easy' },
    { n: 9, grade: 'medium' },
    { n: 9, grade: 'hard' },
  ];
  it.each(tiers)('$n x $n $grade: 200 seeds give a unique, valid, never-solved puzzle at least as hard as asked', ({ n, grade }) => {
    const geo = geoFor(n);
    for (let seed = 1; seed <= SEEDS; seed++) {
      const g = generate(seed, geo, grade);
      expect(countSolutions(g.given, geo, 2), `seed ${seed}`).toBe(1);
      expect(isValidComplete(g.solution, geo), `seed ${seed}`).toBe(true);
      expect(solveUnique(g.given, geo), `seed ${seed}`).toEqual(g.solution);
      g.given.forEach((d, i) => expect(d === 0 || d === g.solution[i]).toBe(true));
      expect(emptyCount(g.given)).toBeGreaterThan(0);
      expect(GRADE_RANK[gradeOfPuzzle(g.given, geo)], `seed ${seed}`).toBeGreaterThanOrEqual(GRADE_RANK[grade]);
      expect(g.grade).toBe(gradeOfPuzzle(g.given, geo));
      expect(g.clues).toBe(geo.cells - emptyCount(g.given));
      expect(g.clues).toBeGreaterThanOrEqual(CLUE_FLOOR[n][grade]);
      expect(g.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    }
  }, 120_000);

  it('bounds the work with operation counts, not wall time', () => {
    const geo = geoFor(9);
    let worst = 0;
    for (let seed = 1; seed <= SEEDS; seed++) worst = Math.max(worst, generate(seed, geo, 'hard').ops);
    // 9x9 hard is the costly tier; the cap is a safety stop and real calls stay far below it.
    expect(worst).toBeLessThan(OPS_CAP);
    expect(worst).toBeLessThan(250_000);
  }, 120_000);

  it('6x6 hard is best effort: still unique, and the grade is the true one, never relabelled', () => {
    const geo = geoFor(6);
    for (let seed = 1; seed <= 50; seed++) {
      const g = generate(seed, geo, 'hard');
      expect(countSolutions(g.given, geo, 2)).toBe(1);
      expect(g.grade).toBe(gradeOfPuzzle(g.given, geo));
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    const geo = geoFor(9);
    expect(generate(42, geo, 'medium')).toEqual(generate(42, geo, 'medium'));
    const a = generate(1, geo, 'easy').given.join('');
    const b = generate(2, geo, 'easy').given.join('');
    expect(a).not.toBe(b);
  });

  it('easy puzzles solve with naked singles alone; medium needs more; hard needs locked candidates or a guess', () => {
    const geo = geoFor(9);
    for (let seed = 1; seed <= 20; seed++) {
      const easy = generate(seed, geo, 'easy');
      expect(logicSolve(easy.given, geo, 'naked').solved).toBe(true);
      const medium = generate(seed, geo, 'medium');
      expect(logicSolve(medium.given, geo, 'naked').solved).toBe(false);
      expect(logicSolve(medium.given, geo, 'pair').solved).toBe(true);
      const hard = generate(seed, geo, 'hard');
      expect(logicSolve(hard.given, geo, 'pair').solved).toBe(false);
    }
  });
});

describe('solver', () => {
  const geo9 = geoFor(9);

  it('counts 0, 1 and 2 solutions', () => {
    expect(countSolutions(Array.from({ length: 81 }, () => 0), geo9, 2)).toBe(2);
    const g = generate(5, geo9, 'easy');
    expect(countSolutions(g.given, geo9, 2)).toBe(1);
    const bad = g.given.slice();
    const i = bad.findIndex((v) => v === 0);
    const j = geo9.peers[i]!.find((p) => bad[p] !== 0)!;
    bad[i] = bad[j]!;
    expect(countSolutions(bad, geo9, 2)).toBe(0);
  });

  it('a puzzle with two solutions is detected by the counter (rejected by the generator)', () => {
    const g = generate(9, geo9, 'easy');
    const loose = g.solution.slice();
    for (let i = 0; i < 81; i++) if (geo9.rowOf[i]! < 2) loose[i] = 0; // two empty rows leave many solutions
    expect(countSolutions(loose, geo9, 2)).toBe(2);
  });

  it('a limit of 1 stops at the first solution', () => {
    expect(countSolutions(Array.from({ length: 36 }, () => 0), geoFor(6), 1)).toBe(1);
  });

  it('solves a known classic puzzle exactly', () => {
    const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);
    const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'.split('').map(Number);
    expect(solveUnique(puzzle, geo9)).toEqual(solution);
    const trace = logicSolve(puzzle, geo9);
    expect(trace.solved).toBe(true);
    expect(trace.grid).toEqual(solution);
  });

  it('every step the ladder takes is the right digit, and nextStep always agrees with the solution', () => {
    for (const [n, grade] of [[6, 'medium'], [9, 'medium'], [9, 'hard']] as const) {
      const geo = geoFor(n);
      for (let seed = 1; seed <= 15; seed++) {
        const g = generate(seed, geo, grade);
        for (const s of logicSolve(g.given, geo).steps) expect(s.digit).toBe(g.solution[s.cell]);
        const grid = g.given.slice();
        for (let k = 0; k < 90 && emptyCount(grid) > 0; k++) {
          const step = nextStep(grid, g.solution, geo)!;
          expect(step.digit).toBe(g.solution[step.cell]);
          grid[step.cell] = step.digit;
        }
        expect(grid).toEqual(g.solution);
      }
    }
  });

  it('hidden singles name their unit', () => {
    const geo = geoFor(9);
    let seen = 0;
    for (let seed = 1; seed <= 20 && seen === 0; seed++) {
      const g = generate(seed, geo, 'medium');
      const hidden = logicSolve(g.given, geo).steps.find((s) => s.tech === 'hidden');
      if (hidden) {
        seen += 1;
        expect(['row', 'col', 'box']).toContain(hidden.unit);
        expect(hidden.unitIndex).toBeGreaterThanOrEqual(0);
        expect(hidden.unitIndex).toBeLessThan(9);
      }
    }
    expect(seen).toBe(1);
  });

  it('conflict detection is exact', () => {
    const geo = geoFor(9);
    const grid = Array.from({ length: 81 }, () => 0);
    expect(conflictCells(grid, geo)).toEqual([]);
    grid[0] = 5;
    grid[8] = 5; // same row
    grid[40] = 5; // alone
    grid[20] = 5; // same box as cell 0 (row 2, col 2)
    expect(conflictCells(grid, geo)).toEqual([0, 8, 20]);
    grid[8] = 6;
    grid[20] = 7;
    grid[72] = 5; // same column as 0
    expect(conflictCells(grid, geo)).toEqual([0, 72]);
  });

  it('counts the digits still to place', () => {
    const geo = geoFor(6);
    const grid = Array.from({ length: 36 }, () => 0);
    grid[0] = 1;
    grid[1] = 1;
    grid[2] = 3;
    expect(remainingPerDigit(grid, geo)).toEqual([4, 6, 5, 6, 6, 6]);
  });
});

describe('setup: difficulty, perks and buffs', () => {
  it('difficulty picks the board and the grade', () => {
    expect([1, 2, 3, 4, 5].map((d) => sizeFor(d as Difficulty))).toEqual([6, 6, 9, 9, 9]);
    expect([1, 2, 3, 4, 5].map((d) => gradeFor(d as Difficulty))).toEqual(['easy', 'medium', 'easy', 'medium', 'hard']);
    expect(start(3, 1).n).toBe(6);
    expect(start(3, 5).n).toBe(9);
    expect(start(3, 1).grid).toHaveLength(36);
    expect(start(3, 5).grid).toHaveLength(81);
  });

  it('the grade the state reports is the real one, at least the requested one', () => {
    for (const d of [1, 2, 3, 4, 5] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = start(seed, d);
        expect(GRADE_RANK[s.grade]).toBeGreaterThanOrEqual(GRADE_RANK[s.wanted]);
        expect(s.grade).toBe(gradeOfPuzzle(s.given, geoFor(s.n)));
      }
    }
  });

  it('harder difficulties give fewer clues and a longer par', () => {
    const clues = [1, 2, 3, 4, 5].map((d) => start(11, d as Difficulty).clues);
    expect(clues[2]!).toBeGreaterThan(clues[3]!);
    expect(clues[3]!).toBeGreaterThan(clues[4]!);
    const pars = [1, 2, 3, 4, 5].map((d) => PAR_SECONDS[d as Difficulty]);
    expect([...pars].sort((a, b) => a - b)).toEqual(pars);
  });

  it('Study gives a free hint, two from power 24', () => {
    expect(start(1, 3, parties.starter).freeHints).toBe(0);
    expect(start(1, 3, member('study', 1)).freeHints).toBe(1);
    expect(start(1, 3, member('study', 12)).freeHints).toBe(2);
  });

  it('the hint buff adds free hints on top', () => {
    const run: Partial<RunContext> = { buffs: [{ id: 'b', kind: 'hint', amount: 3 }] };
    expect(start(1, 3, member('study', 1), run).freeHints).toBe(4);
    expect(start(1, 3, parties.starter, run).freeHints).toBe(3);
  });

  it('Sleep and the time buff stretch the par', () => {
    const base = start(1, 3, parties.starter).par;
    expect(base).toBe(PAR_SECONDS[3]);
    const slept = start(1, 3, member('sleep', 12)).par;
    expect(slept).toBe(Math.floor((PAR_SECONDS[3] * 132) / 100)); // power 44: +10 + 22 percent
    expect(start(1, 3, parties.starter, { buffs: [{ id: 't', kind: 'time', amount: 45 }] }).par).toBe(base + 45);
  });

  it('Clean turns note clearing on, Social and Hygiene are recorded', () => {
    const s = start(1, 3, { members: [...member('clean').members, ...member('social').members, ...member('hygiene').members] });
    expect(s.cleanOn).toBe(true);
    expect(Object.keys(s.perks).sort()).toEqual(['clean', 'hygiene', 'social']);
    expect(s.freeChecksTotal).toBe(1);
    expect(start(1, 3, parties.single).cleanOn).toBe(false);
  });

  it('a member without a habit changes nothing and still takes part', () => {
    const s = start(1, 3, parties.mixed);
    expect(s.troops).toEqual(parties.mixed.members.map((m) => m.id));
    expect(s.perks.study).toBeUndefined();
  });

  it('luck puts extra digits in the same puzzle and keeps the solution unique', () => {
    const plain = start(8, 5);
    const lucky = start(8, 5, parties.starter, { buffs: [{ id: 'l', kind: 'luck', amount: 25 }] });
    expect(lucky.solution).toEqual(plain.solution);
    expect(lucky.luckClues).toBe(3);
    expect(lucky.clues).toBe(plain.clues + 3);
    plain.given.forEach((d, i) => d && expect(lucky.given[i]).toBe(d));
    expect(countSolutions(lucky.given, geoFor(9), 2)).toBe(1);
    expect(lucky.grade).toBe(gradeOfPuzzle(lucky.given, geoFor(9)));
    const g = generate(8, geoFor(9), 'hard');
    expect(addLuckClues(g.given, g.solution, geoFor(9), 0)).toEqual(g.given);
  });
});

describe('play', () => {
  it('a right digit is placed, a wrong digit counts a slip and stays', () => {
    const s0 = start(3, 3);
    const c = blank(s0);
    const s1 = act(s0, right(s0, c));
    expect(s1.grid[c]).toBe(s0.solution[c]);
    expect(s1.mistakes).toBe(0);
    expect(s1.moves).toBe(1);
    const s2 = act(s0, wrong(s0, c));
    expect(s2.grid[c]).not.toBe(s0.solution[c]);
    expect(s2.mistakes).toBe(1);
    expect(wrongCells(s2)).toEqual([c]);
    expect(act(s2, wrong(s2, c)).mistakes).toBe(1); // another wrong digit in the same cell is a second slip
  });

  it('given digits, invalid cells, invalid digits and the same digit again change nothing', () => {
    const s0 = start(3, 3);
    const g = s0.given.findIndex((d) => d !== 0);
    expect(act(s0, { type: 'place', cell: g, digit: 1 })).toBe(s0);
    expect(act(s0, { type: 'erase', cell: g })).toBe(s0);
    expect(act(s0, { type: 'note', cell: g, digit: 1 })).toBe(s0);
    const c = blank(s0);
    expect(act(s0, { type: 'place', cell: -1, digit: 1 })).toBe(s0);
    expect(act(s0, { type: 'place', cell: 81, digit: 1 })).toBe(s0);
    expect(act(s0, { type: 'place', cell: c, digit: 0 })).toBe(s0);
    expect(act(s0, { type: 'place', cell: c, digit: 10 })).toBe(s0);
    expect(act(s0, { type: 'place', cell: 1.5, digit: 1 })).toBe(s0);
    const s1 = act(s0, right(s0, c));
    expect(act(s1, right(s0, c))).toBe(s1);
    expect(act(s0, { type: 'erase', cell: c })).toBe(s0);
  });

  it('erase clears a digit or the notes of a cell', () => {
    const s0 = start(3, 3);
    const c = blank(s0);
    const s1 = act(s0, right(s0, c), { type: 'erase', cell: c });
    expect(s1.grid[c]).toBe(0);
    const s2 = act(s0, { type: 'note', cell: c, digit: 4 }, { type: 'erase', cell: c });
    expect(s2.notes[c]).toBe(0);
  });

  it('notes toggle, are cleared by placing, and are refused on filled cells', () => {
    const s0 = start(3, 3);
    const c = blank(s0);
    const s1 = act(s0, { type: 'note', cell: c, digit: 1 }, { type: 'note', cell: c, digit: 4 });
    expect(s1.notes[c]).toBe(0b1001);
    expect(act(s1, { type: 'note', cell: c, digit: 1 }).notes[c]).toBe(0b1000);
    expect(act(s1, right(s0, c)).notes[c]).toBe(0);
    const s2 = act(s0, right(s0, c));
    expect(act(s2, { type: 'note', cell: c, digit: 2 })).toBe(s2);
  });

  it('with the Clean perk, placing a digit removes it from the notes of its peers; the toggle can turn it off and back on', () => {
    const party = member('clean');
    const s0 = start(3, 3, party);
    const c = blank(s0);
    const geo = geoFor(9);
    const peer = geo.peers[c]!.find((p) => s0.grid[p] === 0)!;
    const d = s0.solution[c]!;
    const s1 = act(s0, { type: 'note', cell: peer, digit: d }, right(s0, c));
    expect(s1.notes[peer]).toBe(0);
    const off = act(s0, { type: 'toggleClean' }, { type: 'note', cell: peer, digit: d }, right(s0, c));
    expect(off.cleanOn).toBe(false);
    expect(off.notes[peer]).toBe(1 << (d - 1));
    const on = act(off, { type: 'toggleClean' });
    expect(on.cleanOn).toBe(true);
    expect(on.notes[peer]).toBe(0); // the impossible note went when it was switched on
    expect(act(start(3, 3, parties.single), { type: 'toggleClean' }).cleanOn).toBe(false); // no Clean troop, no toggle
  });

  it('undo and redo are exact, and a new action drops the redo line', () => {
    let s = start(6, 4);
    const start0 = s;
    const trail = [s];
    for (let k = 0; k < 6; k++) {
      const c = blank(s, k);
      s = act(s, { type: 'note', cell: c, digit: 2 }, right(s, c), k % 2 ? { type: 'erase', cell: c } : { type: 'note', cell: blank(s, 3), digit: 5 });
      trail.push(s);
    }
    const finalState = s;
    let guard = 0;
    while (s.past.length > 0 && guard++ < 100) s = act(s, { type: 'undo' });
    expect(s.grid).toEqual(start0.grid);
    expect(s.notes).toEqual(start0.notes);
    expect(act(s, { type: 'undo' })).toBe(s);
    while (s.future.length > 0 && guard++ < 200) s = act(s, { type: 'redo' });
    expect(s.grid).toEqual(finalState.grid);
    expect(s.notes).toEqual(finalState.notes);
    expect(act(s, { type: 'redo' })).toBe(s);
    const back = act(s, { type: 'undo' });
    expect(back.future).toHaveLength(1);
    expect(act(back, { type: 'note', cell: blank(back, 5), digit: 1 }).future).toHaveLength(0);
  });

  it('undo gives a digit back but a slip stays counted', () => {
    const s0 = start(3, 3);
    const c = blank(s0);
    const s1 = act(s0, wrong(s0, c), { type: 'undo' });
    expect(s1.grid[c]).toBe(0);
    expect(s1.mistakes).toBe(1);
  });

  it('check marks the wrong digits, costs points, and the marks clear when the cell changes', () => {
    const s0 = start(3, 3);
    expect(act(s0, { type: 'check' })).toBe(s0); // nothing typed yet, nothing to check
    const [a, b] = [blank(s0, 0), blank(s0, 1)];
    const s1 = act(s0, wrong(s0, a), right(s0, b), { type: 'check' });
    expect(s1.flagged).toEqual([a]);
    expect(s1.checks).toBe(1);
    expect(s1.last?.count).toBe(1);
    expect(checkCost(s1)).toBe(SCORE.check);
    expect(act(s1, { type: 'erase', cell: a }).flagged).toEqual([]);
    expect(act(s1, right(s0, a)).flagged).toEqual([]);
    expect(act(act(s1, { type: 'erase', cell: a }), { type: 'undo' }).flagged).toEqual([]); // marks never come back
    const clean = act(s0, right(s0, a), { type: 'check' });
    expect(clean.flagged).toEqual([]);
    expect(clean.last?.count).toBe(0);
  });

  it('Hygiene makes the first check free', () => {
    const s0 = start(3, 3, member('hygiene'));
    const c = blank(s0);
    const s1 = act(s0, right(s0, c), { type: 'check' });
    expect(checkCost(s1)).toBe(0);
    expect(checkCost(act(s1, { type: 'check' }))).toBe(SCORE.check);
  });

  it('a hint fills a cell with the right digit, names the technique and costs a little', () => {
    const s0 = start(3, 3);
    const s1 = act(s0, { type: 'hint' });
    expect(s1.hints).toBe(1);
    const l = s1.last!;
    expect(l.kind).toBe('hint');
    expect(s1.grid[l.cell]).toBe(s0.solution[l.cell]);
    expect(s1.grid[l.cell]).toBe(l.digit);
    expect(['naked', 'hidden']).toContain(l.tech);
    expect(s1.mistakes).toBe(0);
    expect(hintCost(s1)).toBe(SCORE.hint);
    expect(filledRight(s1)).toBe(1);
  });

  it('free hints cost less, and run out', () => {
    const s0 = start(3, 3, member('study', 1));
    expect(s0.freeHints).toBe(1);
    const s1 = act(s0, { type: 'hint' });
    expect(s1.freeHints).toBe(0);
    expect(hintCost(s1)).toBe(SCORE.freeHint);
    const s2 = act(s1, { type: 'hint' });
    expect(hintCost(s2)).toBe(SCORE.freeHint + SCORE.hint);
  });

  it('a hint with a wrong digit on the board points at it instead of filling', () => {
    const s0 = start(3, 3);
    const c = blank(s0);
    const s1 = act(s0, wrong(s0, c), { type: 'hint' });
    expect(s1.last?.tech).toBe('mistake');
    expect(s1.last?.cell).toBe(c);
    expect(s1.grid).toEqual(act(s0, wrong(s0, c)).grid);
    expect(s1.hints).toBe(1);
    expect(s1.flagged).toEqual([c]);
  });

  it('hints can finish a whole game, one technique at a time', () => {
    let s = start(2, 5);
    const techniques = new Set<string>();
    for (let k = 0; k < 90 && !isOver(s); k++) {
      s = act(s, { type: 'hint' });
      if (s.last?.tech) techniques.add(s.last.tech);
    }
    expect(isSolved(s)).toBe(true);
    expect(techniques.has('naked')).toBe(true);
  });

  it('second counts, forfeit ends as fled, and nothing works after the end', () => {
    const s0 = start(3, 3);
    expect(act(s0, { type: 'second' }, { type: 'second' }).seconds).toBe(2);
    const done = act(s0, { type: 'forfeit' });
    expect(isOver(done)).toBe(true);
    expect(engine.outcome(done)?.result).toBe('fled');
    expect(act(done, { type: 'second' })).toBe(done);
    expect(act(done, right(s0, blank(s0)))).toBe(done);
    expect(engine.outcome(s0)).toBeNull();
    expect(engine.forfeit?.(s0)).toEqual({ type: 'forfeit' });
  });

  it('conflictsOf finds equal digits that share a unit', () => {
    const s0 = start(3, 3);
    const c = blank(s0);
    const peerDigit = s0.grid[geoFor(9).peers[c]!.find((p) => s0.grid[p] !== 0)!]!;
    const s1 = act(s0, { type: 'place', cell: c, digit: peerDigit });
    expect(conflictsOf(s1)).toContain(c);
    expect(conflictsOf(s0)).toEqual([]);
  });
});

describe('scoring', () => {
  it('speed bonus: full to half the par, none from twice the par, in between linear', () => {
    expect(speedBonus(0, 100)).toBe(SCORE.speedMax);
    expect(speedBonus(50, 100)).toBe(SCORE.speedMax);
    expect(speedBonus(100, 100)).toBe(Math.floor((SCORE.speedMax * 2) / 3));
    expect(speedBonus(200, 100)).toBe(0);
    expect(speedBonus(900, 100)).toBe(0);
    expect(speedBonus(75, 100)).toBeGreaterThan(speedBonus(125, 100));
  });

  it('a clean, fast solve scores the maximum; slips, hints and checks each cost something', () => {
    const solved = (mods: Partial<SudokuState> = {}) => {
      const s0 = start(3, 3);
      return { ...s0, grid: s0.solution, ...mods } as SudokuState;
    };
    expect(scoreOf(solved())).toBe(1000);
    expect(scoreOf(solved({ mistakes: 2 }))).toBe(1000 - 2 * SCORE.mistake);
    expect(scoreOf(solved({ mistakes: 9 }))).toBe(1000 - SCORE.accuracyMax);
    expect(scoreOf(solved({ hints: 1 }))).toBe(1000 - SCORE.hint);
    expect(scoreOf(solved({ checks: 2 }))).toBe(1000 - 2 * SCORE.check);
    expect(scoreOf(solved({ seconds: 4 * PAR_SECONDS[3] }))).toBe(1000 - SCORE.speedMax);
    expect(scoreOf(solved({ mistakes: 99, hints: 99, checks: 99, seconds: 99999 }))).toBe(0);
  });

  it('leaving early scores in proportion to the blanks filled right, at most half, and less than any win', () => {
    const s0 = start(3, 3);
    expect(engine.outcome(act(s0, { type: 'forfeit' }))?.score).toBe(0);
    let s = s0;
    const blanks = emptyCount(s0.given);
    for (let k = 0; k < blanks / 2; k++) s = act(s, right(s, blank(s)));
    const half = engine.outcome(act(s, { type: 'forfeit' }))!;
    expect(half.result).toBe('fled');
    expect(half.score).toBeGreaterThan(200);
    expect(half.score).toBeLessThanOrEqual(SCORE.partialMax);
    const sloppy = engine.outcome(act(s, wrong(s, blank(s)), { type: 'forfeit' }))!;
    expect(sloppy.score).toBeLessThan(half.score);
    expect(SCORE.partialMax).toBeLessThan(SCORE.base);
  });

  it('the outcome says what happened, in the player language, and teaches the technique used most', () => {
    const en = playToEnd(game, 4, parties.full, emptyRun(3)).outcome!;
    const fr = playToEnd(game, 4, parties.full, emptyRun(3), 20000, { locale: 'fr' }).outcome!;
    expect(en.result).toBe('won');
    expect(en.log[0]).toMatch(/^Grid solved in \d+:\d\d \(Easy, 9x9\)\.$/);
    expect(fr.log[0]).toMatch(/^Grille résolue en \d+:\d\d \(Facile, 9x9\)\.$/);
    expect(en.learned?.topic.en).toBe('Naked single');
    expect(en.learned?.note.fr).toMatch(/seul chiffre/);
    expect(en.stats).toMatchObject({ grade: 'easy', size: '9x9', mistakes: 0 });
    const left = engine.outcome(act(start(4, 3), { type: 'forfeit' }))!;
    expect(left.log[0]).toMatch(/^You stopped with 0 of \d+ blanks filled/);
    expect(left.learned).toBeUndefined();
  });

  it('topTechnique prefers the harder one on a tie and is null for nothing', () => {
    expect(topTechnique({ naked: 0, hidden: 0, deeper: 0 })).toBeNull();
    expect(topTechnique({ naked: 3, hidden: 3, deeper: 0 })).toBe('hidden');
    expect(topTechnique({ naked: 9, hidden: 3, deeper: 4 })).toBe('naked');
  });

  it('formatTime shows minutes and seconds', () => {
    expect([0, 9, 65, 600, 3599].map(formatTime)).toEqual(['0:00', '0:09', '1:05', '10:00', '59:59']);
  });
});

describe('the bot and the party', () => {
  it('solves every grid by logic: 100 seeds at every difficulty, won, valid, replaying identically', () => {
    for (const d of [1, 2, 3, 4, 5] as const) {
      for (let seed = 1; seed <= 100; seed++) {
        const a = playToEnd(game, seed, parties.full, emptyRun(d));
        expect(a.outcome?.result, `d${d} seed ${seed}`).toBe('won');
        expect(isSolved(a.state)).toBe(true);
        expect(a.state.mistakes).toBe(0);
        if (seed <= 5) expect(playToEnd(game, seed, parties.full, emptyRun(d)).actions).toEqual(a.actions);
      }
    }
  }, 120_000);

  it('the bot is timed: it lets seconds pass and finishes inside the par at about its pace', () => {
    const r = playToEnd(game, 3, parties.starter, emptyRun(3));
    const par = PAR_SECONDS[3];
    expect(r.state.seconds).toBeGreaterThan((par * (BOT_PACE_PERCENT - 15)) / 100);
    expect(r.state.seconds).toBeLessThanOrEqual((par * BOT_PACE_PERCENT) / 100 + 2);
    expect(r.actions.filter((a) => a.type === 'second').length).toBe(r.state.seconds);
  });

  it('a full party plays differently from a starter party: more par, free hints, a better score', () => {
    const full = playToEnd(game, 21, parties.full, emptyRun(4));
    const starter = playToEnd(game, 21, parties.starter, emptyRun(4));
    expect(full.state.par).toBeGreaterThan(starter.state.par);
    expect(full.state.freeHintsTotal).toBeGreaterThan(0);
    expect(full.outcome!.score).toBeGreaterThan(starter.outcome!.score);
  });

  it('the time buff stretches the par and lifts the score of a slow game; the hint buff gives free hints', () => {
    const slow: RunContext = { ...emptyRun(5), buffs: [] };
    const plain = playToEnd(game, 9, parties.starter, slow);
    const timed = playToEnd(game, 9, parties.starter, { ...slow, buffs: [{ id: 't', kind: 'time', amount: 120 }] });
    expect(timed.state.par).toBe(plain.state.par + 120);
    expect(timed.outcome!.score).toBeGreaterThanOrEqual(plain.outcome!.score);
    const hinted = playToEnd(game, 9, parties.starter, { ...slow, buffs: [{ id: 'h', kind: 'hint', amount: 5 }] });
    expect(hinted.state.freeHintsTotal).toBe(5);
    expect(hinted.outcome!.result).toBe('won');
  });

  it('the bot spends a free hint when only a deep step is left, and erases a wrong digit if it finds one', () => {
    const base = start(5, 5, parties.full);
    const wrongOne = act(base, wrong(base, blank(base)));
    expect(engine.botPlay({ ...wrongOne, seconds: 9999 }, () => 0)).toMatchObject({ type: 'erase' });
    const r = playToEnd(game, 5, parties.full, emptyRun(5));
    expect(r.outcome?.result).toBe('won');
    expect(engine.botPlay(r.state, () => 0)).toBeNull();
  });

  it('attack, defense and revive change nothing', () => {
    const plain = playToEnd(game, 12, parties.full, emptyRun(3));
    const buffs: RunContext = { ...emptyRun(3), buffs: [{ id: 'a', kind: 'attack', amount: 50 }, { id: 'd', kind: 'defense', amount: 50 }, { id: 'r', kind: 'revive', amount: 3 }] };
    const buffed = playToEnd(game, 12, parties.full, buffs);
    expect(buffed.actions).toEqual(plain.actions);
    expect(buffed.outcome).toEqual(plain.outcome);
  });

  it('the hard run (difficulty 5) and the buffed run both finish', () => {
    expect(playToEnd(game, 1, parties.full, runs.hard).outcome?.result).toBe('won');
    expect(playToEnd(game, 1, parties.full, runs.buffed).outcome?.result).toBe('won');
  });
});
