/**
 * The Screen plays the engine: the board is an ARIA grid with row, column and
 * box in each name; digits, notes, erase, undo, hints and checks work from the
 * keyboard and from the pad; the live region says what happened; Stop here
 * ends as fled; Leave calls onExit once; French follows the locale.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRun, makeMember, type GameScreenProps, type Party } from '../contract';
import { parties } from '../testing/contract';
import { engine } from './engine';
import SudokuScreen from './Screen';

const social: Party = { members: [makeMember({ id: 'social', name: 'Wren', habit: 'social', level: 4, loyalty: 50 })] };

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.starter, seed: 7, run: emptyRun(3), locale: 'en', reducedMotion: false, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cells = () => screen.getAllByRole('gridcell');
const live = () => screen.getByTestId('sudoku-live');
/** The puzzle the screen shows, rebuilt from the engine with the same inputs. */
const game = (p: GameScreenProps) => engine.initial(p.seed, p.party, p.run, p.locale);
const firstBlank = (p: GameScreenProps) => game(p).grid.findIndex((v) => v === 0);
const cell = (i: number) => screen.getByTestId(`sudoku-cell-${i}`);
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(el, { key: k, ...init });
const typeDigit = (el: Element, d: number, init: KeyboardEventInit = {}) => fireEvent.keyDown(el, { key: String(d), code: `Digit${d}`, ...init });

describe('Sudoku screen', () => {
  it('shows the board as a grid with 81 cells whose names carry row, column and box', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sudoku');
    expect(screen.getByRole('grid', { name: 'Sudoku board, 9 by 9' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(9);
    expect(cells()).toHaveLength(81);
    const g = game(p);
    const given = g.grid.findIndex((v) => v !== 0);
    expect(cell(given)).toHaveAttribute('aria-label', expect.stringMatching(new RegExp(`^Row ${Math.floor(given / 9) + 1}, column ${(given % 9) + 1}, box \\d: ${g.grid[given]}, given$`)));
    expect(cell(firstBlank(p))).toHaveAttribute('aria-label', expect.stringMatching(/: empty$/));
  });

  it('has one tab stop (roving focus) and arrow keys move it', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const start = firstBlank(p);
    const rowStart = Math.floor(start / 9) * 9;
    expect(cells().filter((c) => c.tabIndex === 0)).toHaveLength(1);
    expect(cell(start).tabIndex).toBe(0);
    // Moves are tested from the row start so no edge is crossed.
    key(cell(start), 'Home');
    expect(cell(rowStart)).toHaveFocus();
    key(cell(rowStart), 'ArrowRight');
    expect(cell(rowStart + 1)).toHaveFocus();
    expect(cell(rowStart + 1).tabIndex).toBe(0);
    key(cell(rowStart + 1), 'ArrowDown');
    const down = rowStart + 10 < 81 ? rowStart + 10 : rowStart - 8;
    expect(cell(down)).toHaveFocus();
    key(cell(down), 'ArrowLeft');
    expect(cell(down - 1)).toHaveFocus();
    key(cell(down - 1), 'End');
    expect(cell(Math.floor(down / 9) * 9 + 8)).toHaveFocus();
  });

  it('places a digit from the keyboard, announces it, and the same digit again erases it', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const c = firstBlank(p);
    const d = game(p).solution[c]!;
    fireEvent.click(cell(c));
    typeDigit(cell(c), d);
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining(`: ${d}`));
    expect(live()).toHaveTextContent(`${d} placed`);
    typeDigit(cell(c), d);
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringMatching(/: empty$/));
    expect(live()).toHaveTextContent('cleared');
  });

  it('a wrong digit that repeats another is announced as a conflict and counted as a slip', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const g = game(p);
    const c = firstBlank(p);
    const peer = g.grid.find((v, i) => v !== 0 && Math.floor(i / 9) === Math.floor(c / 9))!;
    fireEvent.click(cell(c));
    typeDigit(cell(c), peer);
    expect(live()).toHaveTextContent('conflicts with another');
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining('conflicts with another'));
    expect(screen.getByTestId('sudoku-slips')).toHaveTextContent('1');
  });

  it('notes: N switches, digits become notes, the pad follows, Backspace clears', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const c = firstBlank(p);
    fireEvent.click(cell(c));
    key(cell(c), 'n');
    expect(screen.getByTestId('sudoku-notes')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sudoku-pad-4')).toHaveAccessibleName('Note 4');
    typeDigit(cell(c), 1);
    fireEvent.click(screen.getByTestId('sudoku-pad-4'));
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining('empty, notes 1 4'));
    expect(live()).toHaveTextContent('Note 4 added');
    key(cell(c), 'Backspace');
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringMatching(/: empty$/));
  });

  it('Shift plus a digit writes a note without the switch', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const c = firstBlank(p);
    fireEvent.click(cell(c));
    fireEvent.keyDown(cell(c), { key: '!', code: 'Digit1', shiftKey: true });
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining('notes 1'));
  });

  it('the pad places digits and Erase takes them out; undo and redo are Ctrl+Z, Ctrl+Y and buttons', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const c = firstBlank(p);
    const d = game(p).solution[c]!;
    fireEvent.click(cell(c));
    fireEvent.click(screen.getByTestId(`sudoku-pad-${d}`));
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining(`: ${d}`));
    key(cell(c), 'z', { ctrlKey: true });
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringMatching(/: empty$/));
    expect(live()).toHaveTextContent('Undone');
    key(cell(c), 'y', { ctrlKey: true });
    expect(live()).toHaveTextContent('Redone');
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining(`: ${d}`));
    fireEvent.click(screen.getByTestId('sudoku-erase'));
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringMatching(/: empty$/));
    fireEvent.click(screen.getByTestId('sudoku-undo'));
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining(`: ${d}`));
    expect(screen.getByTestId('sudoku-redo')).toBeEnabled();
  });

  it('a given cell cannot be changed', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const i = game(p).grid.findIndex((v) => v !== 0);
    fireEvent.click(cell(i));
    const before = cell(i).getAttribute('aria-label');
    typeDigit(cell(i), 1);
    key(cell(i), 'Backspace');
    expect(cell(i).getAttribute('aria-label')).toBe(before);
  });

  it('H asks for a hint: the cell fills, the live region explains the technique, the count goes up', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const c = firstBlank(p);
    fireEvent.click(cell(c));
    key(cell(c), 'h');
    expect(screen.getByTestId('sudoku-hints')).toHaveTextContent('1');
    expect(live().textContent).toMatch(/can only be a \d|fits in only one cell/);
    fireEvent.click(screen.getByTestId('sudoku-hint'));
    expect(screen.getByTestId('sudoku-hints')).toHaveTextContent('2');
  });

  it('Check marks the wrong digits and says how many', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const g = game(p);
    const c = firstBlank(p);
    const wrongDigit = (g.solution[c]! % 9) + 1;
    fireEvent.click(cell(c));
    typeDigit(cell(c), wrongDigit);
    fireEvent.click(screen.getByTestId('sudoku-check'));
    expect(live()).toHaveTextContent(/1 digit is off/);
    expect(cell(c)).toHaveAttribute('aria-label', expect.stringContaining('marked wrong'));
  });

  it('6x6 board at difficulty 1: 36 cells, a pad of 6, boxes of 2 by 3', () => {
    const p = props({ run: emptyRun(1) });
    render(<SudokuScreen {...p} />);
    expect(cells()).toHaveLength(36);
    expect(screen.getByRole('grid')).toHaveAccessibleName('Sudoku board, 6 by 6');
    expect(screen.getByTestId('sudoku-pad-6')).toBeInTheDocument();
    expect(screen.queryByTestId('sudoku-pad-7')).toBeNull();
    expect(cell(0)).toHaveAttribute('aria-label', expect.stringMatching(/^Row 1, column 1, box 1/));
    expect(cell(3)).toHaveAttribute('aria-label', expect.stringMatching(/^Row 1, column 4, box 2/));
    expect(cell(12)).toHaveAttribute('aria-label', expect.stringMatching(/^Row 3, column 1, box 3/));
  });

  it('the clock ticks once per second and Pause stops it and hides the board', () => {
    render(<SudokuScreen {...props()} />);
    act(() => void vi.advanceTimersByTime(3100));
    expect(screen.getByTestId('sudoku-time')).toHaveTextContent('0:03');
    fireEvent.click(screen.getByTestId('sudoku-pause'));
    expect(screen.getByTestId('sudoku-paused')).toBeInTheDocument();
    expect(screen.getByTestId('sudoku-board')).toHaveAttribute('aria-hidden', 'true');
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('sudoku-time')).toHaveTextContent('0:03');
    fireEvent.click(screen.getByTestId('sudoku-pause'));
    expect(screen.queryByTestId('sudoku-paused')).toBeNull();
  });

  it('Stop here ends as fled with a partial score and keeps the board; Leave calls onExit once, separately', () => {
    const p = props();
    render(<SudokuScreen {...p} />);
    const c = firstBlank(p);
    fireEvent.click(cell(c));
    typeDigit(cell(c), game(p).solution[c]!);
    fireEvent.click(screen.getByTestId('sudoku-stop'));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled' });
    expect(p.onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('sudoku-result')).toHaveTextContent('troops come home');
    expect(cells()).toHaveLength(81);
    expect(screen.queryByTestId('sudoku-stop')).toBeNull();
    expect(screen.getByTestId('sudoku-pad-1')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sudoku-leave'));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('solving the last cell wins: result line, one onFinish, pad disabled', () => {
    const p = props({ run: emptyRun(1), seed: 3 });
    render(<SudokuScreen {...p} />);
    const g = game(p);
    g.grid.forEach((v, i) => {
      if (v !== 0) return;
      fireEvent.click(cell(i));
      typeDigit(cell(i), g.solution[i]!);
    });
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'won' });
    expect(screen.getByTestId('sudoku-result')).toHaveTextContent(/^Solved in 0:00\. The troops cheer\.$/);
    expect(screen.getByTestId('sudoku-pad-1')).toBeDisabled();
  });

  it('with Social, the pad counts the digits left', () => {
    const p = props({ party: social });
    render(<SudokuScreen {...p} />);
    const left = 9 - game(p).grid.filter((v) => v === 1).length;
    expect(screen.getByTestId('sudoku-pad-1')).toHaveAccessibleName(`Place 1, ${left} left`);
    fireEvent.click(screen.getByText('How to play'));
    expect(within(screen.getByTestId('sudoku-perks')).getByText(/Wren \(Social\)/)).toBeInTheDocument();
  });

  it('Clean adds a switch for note clearing', () => {
    render(<SudokuScreen {...props()} />);
    const sw = screen.getByTestId('sudoku-clean');
    expect(sw).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    expect(live()).toHaveTextContent('no longer clear');
  });

  it('conflict highlight defaults on at difficulty 3 and off at 4, and can be switched', () => {
    render(<SudokuScreen {...props()} />);
    expect(screen.getByTestId('sudoku-conflicts')).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    render(<SudokuScreen {...props({ run: emptyRun(4) })} />);
    const sw = screen.getByTestId('sudoku-conflicts');
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-pressed', 'true');
  });

  it('speaks French when asked', () => {
    const p = props({ locale: 'fr' });
    render(<SudokuScreen {...p} />);
    expect(screen.getByRole('grid')).toHaveAccessibleName('Grille de sudoku, 9 sur 9');
    expect(cell(firstBlank(p))).toHaveAttribute('aria-label', expect.stringMatching(/^Ligne \d, colonne \d, bloc \d\u00a0: vide$/));
    expect(screen.getByTestId('sudoku-hint')).toHaveTextContent('Indice');
    expect(screen.getByTestId('sudoku-stop')).toHaveTextContent("S'arrêter");
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeInTheDocument();
  });

  it('keeps its keys to itself when a button has focus (Enter presses the button)', () => {
    render(<SudokuScreen {...props()} />);
    const hint = screen.getByTestId('sudoku-hint');
    hint.focus();
    expect(fireEvent.keyDown(hint, { key: 'Enter' })).toBe(true);
    expect(screen.getByTestId('sudoku-hints')).toHaveTextContent('0');
  });

  it('with reduced motion the board has the same layout', () => {
    render(<SudokuScreen {...props({ reducedMotion: true })} />);
    expect(cells()).toHaveLength(81);
  });
});
