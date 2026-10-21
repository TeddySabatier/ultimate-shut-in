/** The words the Screen speaks: cell names, live-region lines, perk lines. */
import { describe, expect, it } from 'vitest';
import { emptyRun } from '../contract';
import { parties } from '../testing/contract';
import { engine, type SudokuAction, type SudokuState } from './engine';
import { boardLine, cellLabel, lastMessage, notesText, perkLines } from './messages';
import { strings } from './strings';

const en = strings.en;
const fr = strings.fr;
const start = (d: 1 | 2 | 3 | 4 | 5 = 3, locale: 'en' | 'fr' = 'en') => engine.initial(5, parties.full, emptyRun(d), locale);
const act = (s: SudokuState, ...a: SudokuAction[]) => a.reduce((st, x) => engine.reduce(st, x), s);
const blank = (s: SudokuState) => s.grid.findIndex((v) => v === 0);

describe('messages', () => {
  it('names cells with row, column and box, in both languages', () => {
    const s = start();
    const given = s.grid.findIndex((v) => v !== 0);
    const box = Math.floor(Math.floor(given / 9) / 3) * 3 + Math.floor((given % 9) / 3) + 1;
    expect(cellLabel(s, given, en, null)).toBe(`Row ${Math.floor(given / 9) + 1}, column ${(given % 9) + 1}, box ${box}: ${s.grid[given]}, given`);
    const c = blank(s);
    expect(cellLabel(s, c, en, null)).toMatch(/: empty$/);
    expect(cellLabel(s, c, fr, null)).toMatch(/\u00a0: vide$/);
    const noted = act(s, { type: 'note', cell: c, digit: 1 }, { type: 'note', cell: c, digit: 4 });
    expect(cellLabel(noted, c, en, null)).toMatch(/: empty, notes 1 4$/);
    expect(notesText(0b1001)).toBe('1 4');
  });

  it('says a placed digit is a conflict only when the conflict switch is on', () => {
    const s = start();
    const c = blank(s);
    const peer = s.grid.find((v, i) => v !== 0 && Math.floor(i / 9) === Math.floor(c / 9))!;
    const placed = act(s, { type: 'place', cell: c, digit: peer });
    expect(lastMessage(placed, en, new Set([c]))).toContain('conflicts with another');
    expect(lastMessage(placed, en, null)).not.toContain('conflicts');
    expect(cellLabel(placed, c, en, new Set([c]))).toContain('conflicts with another');
    expect(cellLabel(placed, c, en, null)).not.toContain('conflicts');
  });

  it('has a line for every kind of action, and nothing before the first one', () => {
    let s = start();
    expect(lastMessage(s, en, null)).toBe('');
    const c = blank(s);
    s = act(s, { type: 'note', cell: c, digit: 2 });
    expect(lastMessage(s, en, null)).toMatch(/^Note 2 added/);
    s = act(s, { type: 'note', cell: c, digit: 2 });
    expect(lastMessage(s, en, null)).toMatch(/^Note 2 removed/);
    s = act(s, { type: 'undo' });
    expect(lastMessage(s, en, null)).toBe('Undone.');
    s = act(s, { type: 'redo' });
    expect(lastMessage(s, en, null)).toBe('Redone.');
    s = act(s, { type: 'place', cell: c, digit: s.solution[c]! }, { type: 'check' });
    expect(lastMessage(s, en, null)).toBe('Every digit placed so far is right.');
    expect(lastMessage(s, fr, null)).toMatch(/justes/);
    s = act(s, { type: 'hint' });
    expect(lastMessage(s, en, null)).toMatch(/^Row \d, column \d can only be a \d|^In (row|column|box) \d, a \d fits/);
    s = act(s, { type: 'forfeit' });
    expect(lastMessage(s, en, null)).toBe('You stopped here. The troops come home.');
  });

  it('a wrong digit hint says so, and the finished game says it is solved', () => {
    let s = start(1);
    const c = blank(s);
    s = act(s, { type: 'place', cell: c, digit: (s.solution[c]! % 6) + 1 }, { type: 'hint' });
    expect(lastMessage(s, en, null)).toMatch(/does not belong/);
    let done = start(1);
    for (let i = 0; i < done.grid.length; i++) if (!done.grid[i]) done = act(done, { type: 'place', cell: i, digit: done.solution[i]! });
    expect(lastMessage(done, en, null)).toMatch(/^Solved in 0:00\./);
    expect(lastMessage(done, fr, null)).toMatch(/^Résolu en 0:00\./);
  });

  it('perk lines name the troops that changed the game, and the board line gives grade, size and clues', () => {
    const s = start();
    const lines = perkLines(s, en);
    expect(lines.some((l) => l.includes('(Study)'))).toBe(true);
    expect(lines.some((l) => l.includes('(Sleep): par time'))).toBe(true);
    expect(lines.length).toBe(5);
    expect(perkLines(engine.initial(5, parties.single, emptyRun(3), 'en'), en)).toHaveLength(1);
    expect(boardLine(s, en)).toBe(`Easy · 9 by 9 · ${s.clues} digits given`);
    expect(boardLine(s, fr)).toBe(`Facile · 9 sur 9 · ${s.clues} chiffres donnés`);
  });
});
