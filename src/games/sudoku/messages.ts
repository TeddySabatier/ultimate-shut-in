/**
 * What the Screen says: cell labels for assistive technology and the line the
 * live region announces after each action. Pure functions of the state and
 * the strings, so they are unit tested without a browser.
 */
import { formatText } from '../contract';
import { blanksOfPuzzle, filledRight, formatTime, isSolved, type SudokuState } from './engine';
import { digitsOf, geoFor } from './grid';
import type { strings } from './strings';

export type Text = (typeof strings)['en'];

/** The digits of a notes mask as text: "1 4 7". */
export function notesText(mask: number): string {
  return digitsOf(mask).join(' ');
}

/** The accessible name of one cell: "Row 3, column 5, box 2: 7, given" or "...: empty, notes 1 4". */
export function cellLabel(state: SudokuState, cell: number, t: Text, conflicts: ReadonlySet<number> | null): string {
  const geo = geoFor(state.n);
  const d = state.grid[cell] ?? 0;
  let what: string;
  if (d && state.given[cell]) what = formatText(t.state.given, { d });
  else if (d) what = formatText(t.state.digit, { d });
  else if (state.notes[cell]) what = formatText(t.state.notes, { notes: notesText(state.notes[cell] ?? 0) });
  else what = t.state.empty;
  if (d && state.flagged.includes(cell)) what += t.state.wrong;
  if (d && conflicts?.has(cell)) what += formatText(t.state.conflict, { d });
  return formatText(t.cell, { r: geo.rowOf[cell]! + 1, c: geo.colOf[cell]! + 1, b: geo.boxOf[cell]! + 1, state: what });
}

/** The line for the live region after the last action ('' when nothing happened yet). */
export function lastMessage(state: SudokuState, t: Text, conflicts: ReadonlySet<number> | null): string {
  const geo = geoFor(state.n);
  if (state.forfeited) return t.said.fled;
  if (isSolved(state)) return formatText(t.said.won, { time: formatTime(state.seconds) });
  const l = state.last;
  if (!l) return '';
  const at = { r: l.cell >= 0 ? geo.rowOf[l.cell]! + 1 : 0, c: l.cell >= 0 ? geo.colOf[l.cell]! + 1 : 0, d: l.digit };
  const full = blanksOfPuzzle(state) > 0 && state.grid.every((v) => v > 0);
  switch (l.kind) {
    case 'place':
      if (full) return formatText(t.said.full);
      return formatText(conflicts?.has(l.cell) ? t.said.placeConflict : t.said.place, at);
    case 'erase':
      return formatText(t.said.erase, at);
    case 'note':
      return formatText((state.notes[l.cell] ?? 0) & (1 << (l.digit - 1)) ? t.said.noteOn : t.said.noteOff, at);
    case 'undo':
      return t.said.undo;
    case 'redo':
      return t.said.redo;
    case 'clean':
      return l.count ? t.said.cleanOn : t.said.cleanOff;
    case 'check':
      return l.count === 0 ? t.said.checkOk : l.count === 1 ? t.said.checkOne : formatText(t.said.checkMany, { n: l.count });
    case 'hint': {
      if (full && l.tech !== 'mistake') return t.said.full;
      switch (l.tech) {
        case 'naked':
          return formatText(t.said.hintNaked, at);
        case 'hidden':
          return formatText(t.said.hintHidden, { ...at, unit: formatText(t.unit[l.unit ?? 'row'], { i: (l.unitIndex ?? 0) + 1 }) });
        case 'pair':
          return formatText(t.said.hintPair, at);
        case 'locked':
          return formatText(t.said.hintLocked, at);
        case 'mistake':
          return formatText(t.said.hintMistake, at);
        default:
          return formatText(t.said.hintGuess, at);
      }
    }
    default:
      return '';
  }
}

/** The lines that tell the player which troops changed the game (empty for a party with no perk and a plain run). */
export function perkLines(state: SudokuState, t: Text): string[] {
  const lines: string[] = [];
  const p = state.perks;
  if (p.study) lines.push(state.freeHintsTotal > 1 ? formatText(t.start.study, { name: p.study, hints: state.freeHintsTotal }) : formatText(t.start.studyOne, { name: p.study }));
  if (p.sleep) lines.push(formatText(t.start.sleep, { name: p.sleep, par: formatTime(state.par) }));
  if (p.clean) lines.push(formatText(t.start.clean, { name: p.clean }));
  if (p.social) lines.push(formatText(t.start.social, { name: p.social }));
  if (p.hygiene) lines.push(formatText(t.start.hygiene, { name: p.hygiene }));
  if (state.luckClues > 0) lines.push(formatText(t.start.luck, { n: state.luckClues }));
  return lines;
}

/** One line on the board: the grade, the size and how many digits are given. */
export function boardLine(state: SudokuState, t: Text): string {
  return formatText(t.start.grade, { grade: t.grade[state.grade], n: state.n, clues: state.clues });
}

/** The filled-right count for the result line. */
export function progressOf(state: SudokuState): { filled: number; blanks: number } {
  return { filled: filledRight(state), blanks: blanksOfPuzzle(state) };
}
