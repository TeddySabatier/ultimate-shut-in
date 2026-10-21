/**
 * Sudoku's Screen. State comes only from the engine through useEngine. The
 * board is an ARIA grid (rows and cells with row, column and box in each
 * name, roving focus, arrow keys); the pad, the tools and every shortcut
 * dispatch the engine's own actions. Selection, the notes switch and the
 * conflict switch are display state and stay here. One `second` action per
 * real second feeds the par time. Every word is from strings[locale].
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import { blanksOfPuzzle, conflictsOf, engine, formatTime, geoOf, isSolved } from './engine';
import { bit, remainingPerDigit } from './grid';
import game from './manifest';
import { boardLine, cellLabel, lastMessage, perkLines } from './messages';
import { strings } from './strings';
import styles from './Screen.module.css';

/** `Digit3` and `Numpad3` give 3 whatever Shift does to `key`. */
function digitOf(e: KeyboardEvent, n: number): number {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  const d = m ? Number(m[1]) : /^[0-9]$/.test(e.key) ? Number(e.key) : -1;
  return d >= 0 && d <= n ? d : -1;
}

export default function SudokuScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const t = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const geo = geoOf(state);
  const n = state.n;
  const over = outcome !== null;

  const [sel, setSel] = useState(() => {
    const first = state.grid.findIndex((v) => v === 0);
    return first < 0 ? 0 : first;
  });
  const [notesMode, setNotesMode] = useState(false);
  const [showConflicts, setShowConflicts] = useState(state.difficulty <= 3);
  const [paused, setPaused] = useState(false);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const live = !over && !paused;

  useFixedStep(() => dispatch({ type: 'second' }), { running: live, dtMs: 1000 });

  const conflictList = useMemo(() => conflictsOf(state), [state]);
  const conflictSet = useMemo(() => (showConflicts ? new Set(conflictList) : null), [showConflicts, conflictList]);
  const message = lastMessage(state, t, conflictSet);
  const left = useMemo(() => remainingPerDigit(state.grid, geo), [state.grid, geo]);
  const flagged = useMemo(() => new Set(state.flagged), [state.flagged]);
  const selDigit = state.grid[sel] ?? 0;
  const selRow = geo.rowOf[sel]!;
  const selCol = geo.colOf[sel]!;
  const selBox = geo.boxOf[sel]!;
  const lit = useMemo(() => {
    const l = state.last;
    if (!l || l.kind !== 'hint' || l.unit === undefined) return new Set<number>();
    const idx = l.unit === 'row' ? (l.unitIndex ?? 0) : l.unit === 'col' ? n + (l.unitIndex ?? 0) : 2 * n + (l.unitIndex ?? 0);
    return new Set(geo.units[idx] ?? []);
  }, [state.last, geo, n]);

  // When the game ends, the result takes the focus: the controls it came from are going away.
  useEffect(() => {
    if (over) resultRef.current?.focus({ preventScroll: true });
  }, [over]);

  const move = (cell: number) => {
    setSel(cell);
    cellRefs.current[cell]?.focus({ preventScroll: true });
  };

  /** A digit from the pad or the keyboard: a note in notes mode, the digit otherwise, and the same digit again erases. */
  const enter = (digit: number, asNote: boolean) => {
    if (!live || state.given[sel]) return;
    if (asNote || notesMode) {
      if (!state.grid[sel]) dispatch({ type: 'note', cell: sel, digit });
      return;
    }
    if (state.grid[sel] === digit) dispatch({ type: 'erase', cell: sel });
    else dispatch({ type: 'place', cell: sel, digit });
  };
  const erase = () => {
    if (live && !state.given[sel]) dispatch({ type: 'erase', cell: sel });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key;
    if (e.ctrlKey || e.metaKey) {
      const k = key.toLowerCase();
      if (!live) return;
      if (k === 'z') dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      else if (k === 'y') dispatch({ type: 'redo' });
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey || !live) return;
    const target = e.target as HTMLElement;
    const inGrid = target.closest('[role="grid"]') !== null;
    const onButton = target.closest('button') !== null;
    if (onButton && (key === ' ' || key === 'Enter')) return;
    let handled = true;
    if (inGrid && key === 'ArrowRight') move(selCol < n - 1 ? sel + 1 : sel);
    else if (inGrid && key === 'ArrowLeft') move(selCol > 0 ? sel - 1 : sel);
    else if (inGrid && key === 'ArrowDown') move(selRow < n - 1 ? sel + n : sel);
    else if (inGrid && key === 'ArrowUp') move(selRow > 0 ? sel - n : sel);
    else if (inGrid && key === 'Home') move(selRow * n);
    else if (inGrid && key === 'End') move(selRow * n + n - 1);
    else if (key === 'Backspace' || key === 'Delete') erase();
    else if (key === 'n' || key === 'N') setNotesMode((v) => !v);
    else if (key === 'h' || key === 'H') dispatch({ type: 'hint' });
    else {
      const d = digitOf(e, n);
      if (d === 0) erase();
      else if (d > 0) enter(d, e.shiftKey);
      else handled = false;
    }
    if (handled) e.preventDefault();
  };

  const showCounts = state.perks.social !== undefined;
  const lines = perkLines(state, t);
  const solved = isSolved(state);
  const blanks = blanksOfPuzzle(state);
  const full = state.grid.every((v) => v > 0);
  const resultText = state.forfeited ? t.said.fled : solved ? formatText(t.said.won, { time: formatTime(state.seconds) }) : null;

  const rows: number[][] = [];
  for (let r = 0; r < n; r++) rows.push(Array.from({ length: n }, (_, c) => r * n + c));

  return (
    <SystemWindow
      className={cx(styles.game, reducedMotion && styles.still, n === 6 && styles.small)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={solved ? 'success' : 'default'}
      actions={
        <>
          {over ? null : (
            <button type="button" className="btn btn--danger" data-testid="sudoku-stop" onClick={() => dispatch({ type: 'forfeit' })}>
              {t.stop}
            </button>
          )}
          <button type="button" className="btn" data-testid="sudoku-leave" onClick={exit}>
            {t.leave}
          </button>
        </>
      }
    >
      <div className={styles.layout} onKeyDown={onKeyDown}>
        <div className={styles.boardArea}>
          <p className={styles.stats} data-testid="sudoku-stats">
            <span>
              <span className={styles.label}>{t.time}</span> <span className="mono" data-testid="sudoku-time">{formatTime(state.seconds)}</span>
            </span>
            <span>
              <span className={styles.label}>{t.par}</span> <span className="mono">{formatTime(state.par)}</span>
            </span>
            <span>
              <span className={styles.label}>{t.slips}</span> <span className="mono" data-testid="sudoku-slips">{state.mistakes}</span>
            </span>
            <span>
              <span className={styles.label}>{t.hints}</span> <span className="mono" data-testid="sudoku-hints">{state.hints}</span>
            </span>
          </p>
          <p className={cx('muted', styles.line)} data-testid="sudoku-board-line">
            {boardLine(state, t)}
          </p>

          <div className={cx(styles.boardFrame, paused && !over && styles.hiddenBoard)}>
            <div role="grid" aria-label={formatText(t.boardLabel, { n })} aria-rowcount={n} aria-colcount={n} aria-hidden={paused && !over ? true : undefined} className={styles.board} data-testid="sudoku-board" data-size={n}>
              {rows.map((row, r) => (
                <div role="row" aria-rowindex={r + 1} key={r} className={styles.row}>
                  {row.map((i) => {
                    const c = i - r * n;
                    const d = state.grid[i] ?? 0;
                    const isGiven = state.given[i] !== 0;
                    const peer = i !== sel && (geo.rowOf[i] === selRow || geo.colOf[i] === selCol || geo.boxOf[i] === selBox);
                    const same = selDigit !== 0 && d === selDigit && i !== sel;
                    const bad = conflictSet?.has(i) === true && d !== 0;
                    const off = flagged.has(i) && d !== 0;
                    const hinted = state.last?.kind === 'hint' && state.last.cell === i;
                    const mask = state.notes[i] ?? 0;
                    return (
                      <div
                        key={i}
                        ref={(el) => {
                          cellRefs.current[i] = el;
                        }}
                        role="gridcell"
                        aria-colindex={c + 1}
                        aria-selected={sel === i}
                        aria-label={cellLabel(state, i, t, conflictSet)}
                        tabIndex={sel === i ? 0 : -1}
                        data-cell={i}
                        data-testid={`sudoku-cell-${i}`}
                        className={cx(
                          styles.cell,
                          isGiven && styles.given,
                          peer && styles.peer,
                          lit.has(i) && styles.unitLit,
                          same && styles.same,
                          sel === i && styles.selected,
                          bad && styles.conflict,
                          off && styles.off,
                          hinted && styles.hinted,
                          c % geo.boxC === geo.boxC - 1 && c < n - 1 && styles.boxRight,
                          r % geo.boxR === geo.boxR - 1 && r < n - 1 && styles.boxBottom,
                        )}
                        onClick={() => setSel(i)}
                        onFocus={() => setSel(i)}
                      >
                        {d ? (
                          <span className={styles.digit} aria-hidden="true">
                            {d}
                          </span>
                        ) : mask ? (
                          <span className={styles.notes} aria-hidden="true" data-notes={mask}>
                            {Array.from({ length: n }, (_, k) => (
                              <span key={k}>{mask & bit(k + 1) ? k + 1 : ''}</span>
                            ))}
                          </span>
                        ) : null}
                        {bad || off ? <span className={styles.flag} aria-hidden="true">{off ? '×' : '!'}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {paused && !over ? (
              <p className={styles.pausedNote} data-testid="sudoku-paused">
                {t.paused}
              </p>
            ) : null}
          </div>

          <p className={cx(styles.announce, resultText !== null && 'srOnly')} role="status" aria-live="polite" data-testid="sudoku-live">
            {message}
          </p>
          {resultText ? (
            <p ref={resultRef} tabIndex={-1} className={cx(styles.result, solved ? styles.resultWon : null)} data-testid="sudoku-result">
              {resultText}
            </p>
          ) : full && blanks > 0 ? (
            <p className={cx('muted', styles.line)}>{t.said.full}</p>
          ) : null}
        </div>

        <div className={styles.controls}>
          <div role="group" aria-label={t.padLabel} className={styles.pad} data-testid="sudoku-pad">
            {Array.from({ length: n }, (_, k) => {
              const d = k + 1;
              const remaining = left[k] ?? 0;
              const name = formatText(notesMode ? t.padNote : t.padPlace, { d }) + (showCounts ? formatText(t.padLeft, { left: remaining }) : '');
              return (
                <button
                  key={d}
                  type="button"
                  className={cx(styles.padKey, selDigit === d && styles.padOn)}
                  aria-label={name}
                  disabled={!live}
                  data-testid={`sudoku-pad-${d}`}
                  onClick={() => enter(d, false)}
                >
                  <span className={styles.padDigit} aria-hidden="true">
                    {d}
                  </span>
                  {showCounts ? (
                    <span className={styles.padLeft} aria-hidden="true">
                      {remaining}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button type="button" className={styles.padKey} aria-label={t.erase} disabled={!live} data-testid="sudoku-erase" onClick={erase}>
              <span className={styles.padDigit} aria-hidden="true">&#9003;</span>
            </button>
          </div>

          <div role="group" aria-label={t.toolsLabel} className={styles.tools}>
            <button type="button" className={styles.tool} aria-pressed={notesMode} disabled={!live} data-testid="sudoku-notes" onClick={() => setNotesMode((v) => !v)}>
              {notesMode ? t.notesOn : t.notes}
            </button>
            <button type="button" className={styles.tool} disabled={!live || state.past.length === 0} data-testid="sudoku-undo" onClick={() => dispatch({ type: 'undo' })}>
              {t.undo}
            </button>
            <button type="button" className={styles.tool} disabled={!live || state.future.length === 0} data-testid="sudoku-redo" onClick={() => dispatch({ type: 'redo' })}>
              {t.redo}
            </button>
            <button
              type="button"
              className={styles.tool}
              disabled={!live}
              data-testid="sudoku-hint"
              aria-label={state.freeHints > 0 ? `${t.hint}, ${formatText(t.freeHints, { n: state.freeHints })}` : t.hint}
              onClick={() => dispatch({ type: 'hint' })}
            >
              {t.hint}
              {state.freeHints > 0 ? <span className={styles.toolSub}>{formatText(t.freeHints, { n: state.freeHints })}</span> : null}
            </button>
            <button type="button" className={styles.tool} disabled={!live} data-testid="sudoku-check" onClick={() => dispatch({ type: 'check' })}>
              {t.check}
            </button>
            <button type="button" className={styles.tool} aria-pressed={paused} disabled={over} data-testid="sudoku-pause" onClick={() => setPaused((p) => !p)}>
              {paused ? t.resume : t.pause}
            </button>
          </div>

          <div role="group" aria-label={t.optionsLabel} className={styles.options}>
            <button type="button" className={styles.tool} aria-pressed={showConflicts} data-testid="sudoku-conflicts" onClick={() => setShowConflicts((v) => !v)}>
              {t.conflicts}
            </button>
            {state.perks.clean ? (
              <button type="button" className={styles.tool} aria-pressed={state.cleanOn} disabled={!live} data-testid="sudoku-clean" onClick={() => dispatch({ type: 'toggleClean' })}>
                {t.autoClear}
              </button>
            ) : null}
          </div>

          <details className={styles.help}>
            <summary>{t.help}</summary>
            <p>{t.intro}</p>
            <p>{t.keys}</p>
            {lines.length > 0 ? (
              <ul className={styles.perks} data-testid="sudoku-perks">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </details>
        </div>
      </div>
    </SystemWindow>
  );
}
