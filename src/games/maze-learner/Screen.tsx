/**
 * Maze Learner Screen: the maze, the creature, and what it has learned.
 * State comes only from the engine through `useEngine`; the Screen adds only
 * what is about looking: the cursor, the chosen tool, the overlays and the
 * pace of the training playback.
 *
 * Keyboard: arrows move the cursor (Shift paints with the chosen tool),
 * C cheese, P puddle, X erase, Space uses the tool, Enter trains, N moves on.
 * Touch and mouse: tap or drag over the tiles with the chosen tool.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import {
  BONUS,
  EXIT,
  FAR,
  LEVELS,
  MARK_CHEESE,
  MARK_PUDDLE,
  NEAR,
  NEED,
  RES_EXIT,
  RES_EXIT_WET,
  RES_FAR,
  RES_LOOP,
  RES_NEAR,
  START,
  WALL,
  WET,
  WINDOW,
  engine,
  isOver,
  policyDir,
  valueOf,
  windowRate,
  EV_CHEESE,
  EV_ERASE,
  EV_LEVEL,
  EV_LOCKED,
  EV_LOOP,
  EV_LOST,
  EV_NO_REWARD,
  EV_PASSED,
  EV_PUDDLE,
  EV_REMOVE_CRUMBS,
  EV_RESET,
  EV_SPARSE,
  EV_STUCK_NEAR,
  EV_TRAINED,
  EV_TRY_OVER,
  EV_WET,
  type FeedEvent,
  type MazeAction,
  type MazeState,
} from './engine';
import { ArrowGlyph, CheeseGlyph, CreatureGlyph, DoorGlyph, HomeGlyph, PuddleGlyph, StarGlyph } from './Glyphs';
import game from './manifest';
import { strings, type MazeStrings } from './strings';
import styles from './Screen.module.css';

type Tool = 'cheese' | 'puddle' | 'erase';
type Pace = 'watch' | 'fast';

const TRAIN_WATCH = 10;
const TRAIN_FAST = 50;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function points(v: number): string {
  const tenths = Math.round(v / 100);
  return `${Math.trunc(tenths / 10)}.${Math.abs(tenths % 10)}`;
}

function kindWords(kind: number, t: MazeStrings): string {
  switch (kind) {
    case WALL:
      return t.cell.wall;
    case START:
      return t.cell.start;
    case EXIT:
      return t.cell.exit;
    case NEAR:
      return t.cell.near;
    case FAR:
      return t.cell.far;
    case WET:
      return t.cell.wet;
    case BONUS:
      return t.cell.bonus;
    default:
      return t.cell.floor;
  }
}

function resultWords(result: number, t: MazeStrings): string {
  switch (result) {
    case RES_EXIT:
      return t.results.exit;
    case RES_EXIT_WET:
      return t.results.wet;
    case RES_NEAR:
      return t.results.near;
    case RES_FAR:
      return t.results.far;
    case RES_LOOP:
      return t.results.loop;
    default:
      return t.results.timeout;
  }
}

function cellName(s: MazeState, i: number, t: MazeStrings): string {
  const kind = s.cells[i] ?? WALL;
  const mark = s.marks[i] ?? 0;
  const parts = [kindWords(kind, t)];
  if (kind !== WALL && kind !== NEAR && kind !== FAR) {
    if (mark === MARK_CHEESE) parts.push(kind === EXIT || kind === BONUS ? t.cell.cheese : t.cell.crumb);
    if (mark === MARK_PUDDLE) parts.push(t.cell.puddle);
  }
  return parts.join(', ');
}

function describe(ev: FeedEvent, s: MazeState, t: MazeStrings): string {
  const r = Math.trunc(ev.a / s.width) + 1;
  const c = (ev.a % s.width) + 1;
  switch (ev.k) {
    case EV_CHEESE:
      return formatText(t.feed.cheese, { r, c });
    case EV_PUDDLE:
      return formatText(t.feed.puddle, { r, c });
    case EV_ERASE:
      return formatText(t.feed.erase, { r, c });
    case EV_LOCKED:
      return t.feed.locked;
    case EV_TRAINED:
      return formatText(t.feed.trained, { n: ev.a, rate: ev.b });
    case EV_PASSED:
      return formatText(t.feed.passed, { n: ev.a, episodes: ev.b });
    case EV_TRY_OVER:
      return formatText(t.feed.tryOver, { n: ev.a });
    case EV_NO_REWARD:
      return t.feed.noReward;
    case EV_RESET:
      return t.feed.reset;
    case EV_LEVEL:
      return formatText(t.feed.level, { n: ev.a, budget: ev.b });
    case EV_LOST:
      return t.feed.lost;
    case EV_REMOVE_CRUMBS:
      return t.feed.removeCrumbs;
    case EV_LOOP:
      return t.feed.loop;
    case EV_STUCK_NEAR:
      return t.feed.stuckNear;
    case EV_WET:
      return t.feed.wet;
    case EV_SPARSE:
      return t.feed.sparse;
    default:
      return '';
  }
}

/** Heat levels 1 to 5 from a tile's best value; 0 when nothing is expected there. */
function heatLevels(s: MazeState): number[] {
  let top = 0;
  for (let i = 0; i < s.cells.length; i++) if ((s.cells[i] ?? WALL) !== WALL) top = Math.max(top, valueOf(s, s.q, i));
  return s.cells.map((kind, i) => {
    if (kind === WALL || top <= 0) return 0;
    const v = valueOf(s, s.q, i);
    return v <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((5 * v) / top)));
  });
}

export default function MazeLearnerScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const t = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const over = isOver(state);

  const [cursorAt, setCursorAt] = useState({ level: 1, i: state.focus });
  // A new lesson starts with the cursor on the tile the lesson is about.
  const cursor = cursorAt.level === state.level ? cursorAt.i : state.focus;
  const setCursor = useCallback((i: number) => setCursorAt({ level: latest.current.level, i }), []);
  const [tool, setTool] = useState<Tool>('cheese');
  const [showValues, setShowValues] = useState(state.perkStudy);
  const [showVisits, setShowVisits] = useState(false);
  const [showFriend, setShowFriend] = useState(false);
  const [session, setSession] = useState<{ left: number; pace: Pace; level: number; tries: number } | null>(null);
  const [walk, setWalk] = useState({ key: -1, k: 0 });

  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const focusCursor = useRef(false);
  const painting = useRef(false);
  const lastPainted = useRef(-1);
  const latest = useRef(state);
  latest.current = state;

  const apply = useCallback(
    (i: number, which: Tool) => {
      const action: MazeAction = which === 'cheese' ? { type: 'placeReward', cell: i } : which === 'puddle' ? { type: 'placePenalty', cell: i } : { type: 'erase', cell: i };
      dispatch(action);
    },
    [dispatch],
  );

  const moveCursor = useCallback(
    (dir: number, paint: boolean) => {
      const s = latest.current;
      const dr = [-1, 0, 1, 0][dir] ?? 0;
      const dc = [0, 1, 0, -1][dir] ?? 0;
      let r = Math.trunc(cursor / s.width);
      let c = cursor % s.width;
      for (;;) {
        r += dr;
        c += dc;
        if (r < 0 || c < 0 || r >= s.height || c >= s.width) return;
        if ((s.cells[r * s.width + c] ?? WALL) !== WALL) break;
      }
      const i = r * s.width + c;
      focusCursor.current = true;
      setCursor(i);
      if (paint && !isOver(s)) apply(i, tool);
    },
    [apply, cursor, setCursor, tool],
  );

  useEffect(() => {
    if (!focusCursor.current) return;
    focusCursor.current = false;
    cellRefs.current[cursor]?.focus();
  }, [cursor]);

  // Training sessions: one episode per beat while watching, a chunk per animation frame when fast.
  // A session ends by itself when the lesson is passed or lost, a try runs out, or the lesson changes.
  const live = session && !over && !state.passed && session.level === state.level && session.tries === state.triesLeft ? session : null;
  useEffect(() => {
    if (!live) return;
    const fast = live.pace === 'fast' || reducedMotion;
    const n = fast ? Math.min(5, live.left) : 1;
    const run = () => {
      dispatch({ type: 'train', episodes: n });
      setSession((cur) => (cur && cur.left - n > 0 ? { ...cur, left: cur.left - n } : null));
    };
    if (fast) {
      const id = requestAnimationFrame(run);
      return () => cancelAnimationFrame(id);
    }
    const beat = Math.min(900, Math.max(260, (latest.current.route.length - 1) * 38)) / (latest.current.perkMove ? 2 : 1);
    const id = window.setTimeout(run, live.left === TRAIN_WATCH ? 120 : beat);
    return () => window.clearTimeout(id);
  }, [live, dispatch, reducedMotion]);

  // The creature walks the latest route (cosmetic: the engine already knows the whole episode).
  const last = state.route.length - 1;
  const stillCreature = reducedMotion || live?.pace === 'fast' || last <= 0;
  useEffect(() => {
    if (stillCreature) return;
    const per = Math.max(14, Math.min(60, 700 / last)) / (latest.current.perkMove ? 2 : 1);
    let k = 0;
    const id = window.setInterval(() => {
      k += 1;
      setWalk({ key: state.step, k });
      if (k >= last) window.clearInterval(id);
    }, per);
    return () => window.clearInterval(id);
  }, [stillCreature, last, state.step]);
  const step = stillCreature ? last : walk.key === state.step ? walk.k : 0;

  const train = useCallback(
    (n: number, pace: Pace) => {
      if (isOver(latest.current) || latest.current.passed) return;
      setSession({ left: n, pace, level: latest.current.level, tries: latest.current.triesLeft });
    },
    [],
  );

  const next = useCallback(() => {
    setSession(null);
    dispatch({ type: 'nextLevel' });
  }, [dispatch]);

  // Keyboard shortcuts. Ignored while typing in a field, and Enter and Space stay with focused buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const onButton = e.target instanceof HTMLButtonElement;
      const arrow = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(e.key);
      if (arrow >= 0) {
        e.preventDefault();
        moveCursor(arrow, e.shiftKey);
        return;
      }
      const k = e.key.toLowerCase();
      if (over) return;
      if (k === 'c') apply(cursor, 'cheese');
      else if (k === 'p') apply(cursor, 'puddle');
      else if (k === 'x' || k === 'e') apply(cursor, 'erase');
      else if (e.key === ' ' && !onButton) apply(cursor, tool);
      else if (e.key === 'Enter' && !onButton) {
        if (latest.current.passed) next();
        else train(e.shiftKey ? TRAIN_FAST : TRAIN_WATCH, e.shiftKey ? 'fast' : 'watch');
      } else if (k === 'n' && latest.current.passed) next();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, cursor, moveCursor, next, over, tool, train]);

  // Painting with a pointer: press on a tile, then drag over others.
  const tileAt = (e: ReactPointerEvent): number => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tile = el instanceof Element ? el.closest('[data-i]') : null;
    return tile instanceof HTMLElement ? Number(tile.dataset.i) : -1;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const i = tileAt(e);
    if (i < 0 || (state.cells[i] ?? WALL) === WALL) return;
    setCursor(i);
    if (over) return;
    painting.current = true;
    lastPainted.current = i;
    apply(i, tool);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!painting.current || over) return;
    const i = tileAt(e);
    if (i < 0 || i === lastPainted.current || (state.cells[i] ?? WALL) === WALL) return;
    lastPainted.current = i;
    setCursor(i);
    apply(i, tool);
  };
  const stopPainting = () => {
    painting.current = false;
    lastPainted.current = -1;
  };
  useEffect(() => {
    window.addEventListener('pointerup', stopPainting);
    window.addEventListener('pointercancel', stopPainting);
    return () => {
      window.removeEventListener('pointerup', stopPainting);
      window.removeEventListener('pointercancel', stopPainting);
    };
  }, []);
  const onCellKey = (e: ReactKeyboardEvent<HTMLDivElement>, i: number) => {
    if (e.key === ' ' && !over) {
      e.preventDefault();
      e.stopPropagation();
      setCursor(i);
      apply(i, tool);
    }
  };

  const heat = useMemo(() => heatLevels(state), [state]);
  const hintSet = useMemo(() => new Set(state.hints), [state.hints]);
  const rate = windowRate(state);
  const level = state.level;
  const need = NEED[level - 1] ?? 80;
  const win = WINDOW[level - 1] ?? 10;
  const creatureAt = state.route[Math.min(step, state.route.length - 1)] ?? state.focus;
  const routePoints = state.route.map((i) => `${(i % state.width) + 0.5},${Math.trunc(i / state.width) + 0.5}`).join(' ');
  const training = live !== null;
  const showFriendArrows = showFriend && state.q2.length > 0;
  const lastLine = state.episodes > 0 || state.totalEpisodes > 0 ? formatText(t.lastEpisode, { what: resultWords(state.routeResult, t) }) : '';
  const learnedNote = t.level.learned[(state.passed ? level : state.cleared) - 1];

  return (
    <SystemWindow
      className={cx(styles.game, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      actions={
        <>
          {over ? null : (
            <button type="button" className="btn btn--danger" onClick={() => dispatch({ type: 'forfeit' })}>
              {t.forfeit}
            </button>
          )}
          <button type="button" className="btn" onClick={exit}>
            {t.leave}
          </button>
        </>
      }
    >
      {state.totalEpisodes === 0 && level === 1 ? <p className={styles.intro}>{t.intro}</p> : null}

      <p className={styles.status}>
        <span className="mono">{formatText(t.lesson, { n: level, total: LEVELS })}</span>
        <span className="mono" data-testid="maze-learner-episodes">
          {formatText(t.episodes, { used: state.episodes, budget: state.budget })}
        </span>
        <span className="mono" data-testid="maze-learner-success">
          {formatText(t.success, { rate })}
        </span>
        <span className="mono">{formatText(t.tries, { n: state.triesLeft })}</span>
      </p>

      <h3 className={styles.lessonTitle}>{t.level.title[level - 1]}</h3>
      <p className={styles.lessonIntro}>{t.level.intro[level - 1]}</p>
      <p className={styles.goal}>{formatText(t.goal, { goal: formatText(t.level.goal[level - 1] ?? '', { need, window: win }) })}</p>

      <div className={styles.layout}>
        <div className={styles.boardArea}>
          <div
            className={styles.board}
            role="grid"
            aria-label={formatText(t.boardLabel, { n: level, rows: state.height, cols: state.width })}
            aria-rowcount={state.height}
            aria-colcount={state.width}
            data-testid="maze-learner-board"
            data-level={level}
            style={{ ['--cols' as string]: state.width, ['--rows' as string]: state.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
          >
            {Array.from({ length: state.height }, (_, r) => (
              <div key={r} role="row" className={styles.row} aria-rowindex={r + 1}>
                {Array.from({ length: state.width }, (_, c) => {
                  const i = r * state.width + c;
                  const kind = state.cells[i] ?? WALL;
                  const mark = state.marks[i] ?? 0;
                  const terminal = kind === EXIT || kind === NEAR || kind === FAR;
                  const arrow = kind === WALL || terminal ? -1 : policyDir(state, state.q, i);
                  const friendArrow = showFriendArrows && kind !== WALL && !terminal ? policyDir(state, state.q2, i) : -1;
                  const value = kind === WALL || terminal ? 0 : valueOf(state, state.q, i);
                  const here = creatureAt === i && kind !== WALL;
                  const visits = state.visits[i] ?? 0;
                  const label = `${formatText(t.cell.where, { r: r + 1, c: c + 1 })}: ${cellName(state, i, t)}${
                    value > 0 ? `, ${formatText(t.cell.value, { v: points(value) })}` : ''
                  }${arrow >= 0 ? `, ${t.cell.arrow[arrow] ?? ''}` : ''}${hintSet.has(i) ? `, ${t.cell.hint}` : ''}`;
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        cellRefs.current[i] = el;
                      }}
                      role="gridcell"
                      aria-colindex={c + 1}
                      aria-label={label}
                      aria-selected={kind !== WALL ? cursor === i : undefined}
                      aria-disabled={kind === WALL ? true : undefined}
                      tabIndex={kind !== WALL && cursor === i ? 0 : -1}
                      className={styles.cell}
                      data-i={i}
                      data-kind={kind}
                      data-mark={mark}
                      data-cursor={cursor === i ? '1' : '0'}
                      data-hint={hintSet.has(i) ? '1' : '0'}
                      data-heat={showValues && kind !== WALL ? heat[i] : 0}
                      onKeyDown={(e) => onCellKey(e, i)}
                      onFocus={() => kind !== WALL && setCursor(i)}
                    >
                      {kind === START ? <HomeGlyph className={styles.kindSmall} /> : null}
                      {kind === BONUS ? <StarGlyph className={styles.kindSmall} /> : null}
                      {kind === EXIT ? <DoorGlyph size={0} className={styles.kindBig} /> : null}
                      {kind === NEAR ? <DoorGlyph size={1} className={styles.kindBig} /> : null}
                      {kind === FAR ? <DoorGlyph size={2} className={styles.kindBig} /> : null}
                      {arrow >= 0 ? <ArrowGlyph dir={arrow} className={styles.arrow} /> : null}
                      {friendArrow >= 0 ? <ArrowGlyph dir={friendArrow} className={styles.friendArrow} /> : null}
                      {mark === MARK_CHEESE && kind !== NEAR && kind !== FAR ? <CheeseGlyph className={cx(styles.mark, styles.cheese, terminal && styles.markOnDoor)} /> : null}
                      {mark === MARK_PUDDLE ? <PuddleGlyph className={cx(styles.mark, styles.puddle)} /> : null}
                      {showValues && value >= 50 ? <span className={styles.value}>{points(value)}</span> : null}
                      {showVisits && visits > 0 ? <span className={styles.visits}>{visits}</span> : null}
                      {here ? <CreatureGlyph className={cx(styles.creature, !reducedMotion && styles.creatureLive)} /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            <svg className={styles.route} viewBox={`0 0 ${state.width} ${state.height}`} preserveAspectRatio="none" aria-hidden="true">
              <polyline points={routePoints} fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          {lastLine ? <p className={styles.last}>{lastLine}</p> : null}
          {state.perkSocial && level === 3 ? (
            <p className={styles.friend}>{formatText(t.friend, { n: state.friendFar, total: state.friendEpisodes })}</p>
          ) : null}
        </div>

        <div className={styles.panel}>
          {over ? null : (
            <>
              <div role="group" aria-label={t.toolsLabel} className={styles.tools}>
                {(['cheese', 'puddle', 'erase'] as const).map((which) => (
                  <button key={which} type="button" className={cx('btn', styles.tool)} aria-pressed={tool === which} onClick={() => setTool(which)}>
                    {which === 'cheese' ? <CheeseGlyph className={styles.toolIcon} /> : which === 'puddle' ? <PuddleGlyph className={styles.toolIcon} /> : null}
                    <span>{t.tool[which]}</span>
                  </button>
                ))}
              </div>

              <div role="group" aria-label={t.trainLabel} className={styles.actions}>
                {state.passed ? (
                  <button type="button" className="btn btn--primary" onClick={next} disabled={level >= LEVELS}>
                    {t.next}
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn--primary" disabled={training} onClick={() => train(TRAIN_WATCH, 'watch')}>
                      {formatText(t.train, { n: TRAIN_WATCH })}
                    </button>
                    <button type="button" className="btn" disabled={training} onClick={() => train(TRAIN_FAST, 'fast')}>
                      {formatText(t.trainFast, { n: TRAIN_FAST })}
                    </button>
                    {training ? (
                      <button type="button" className="btn btn--danger" onClick={() => setSession(null)}>
                        {t.stop}
                      </button>
                    ) : null}
                    <button type="button" className="btn" disabled={training} onClick={() => dispatch({ type: 'reset' })}>
                      {t.reset}
                    </button>
                  </>
                )}
              </div>

              <div role="group" aria-label={t.dialsLabel} className={styles.dials}>
                <label className={styles.dial}>
                  <span>{formatText(t.epsilon, { n: Math.round(state.epsilon / 10) })}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(state.epsilon / 10)}
                    onChange={(e) => dispatch({ type: 'setEpsilon', value: Number(e.target.value) * 10 })}
                  />
                </label>
                <label className={styles.dial}>
                  <span>{formatText(t.discount, { n: Math.round(state.discount / 10) })}</span>
                  <input
                    type="range"
                    min={0}
                    max={95}
                    step={5}
                    value={Math.round(state.discount / 10)}
                    onChange={(e) => dispatch({ type: 'setDiscount', value: Number(e.target.value) * 10 })}
                  />
                </label>
              </div>

              <div role="group" aria-label={t.viewsLabel} className={styles.views}>
                <button type="button" className="btn" aria-pressed={showValues} onClick={() => setShowValues((v) => !v)}>
                  {t.showValues}
                </button>
                {state.perkStudy ? (
                  <button type="button" className="btn" aria-pressed={showVisits} onClick={() => setShowVisits((v) => !v)}>
                    {t.showVisits}
                  </button>
                ) : null}
                {state.q2.length > 0 ? (
                  <button type="button" className="btn" aria-pressed={showFriend} onClick={() => setShowFriend((v) => !v)}>
                    {t.showFriend}
                  </button>
                ) : null}
              </div>
            </>
          )}

          {state.passed && learnedNote ? (
            <div className={styles.learned}>
              <h4>{t.whatYouSaw}</h4>
              <p>{learnedNote}</p>
            </div>
          ) : null}
          {over && outcome ? (
            <p className={styles.banner} role="status" data-result={outcome.result}>
              {t.end[outcome.result]}
            </p>
          ) : null}

          <div className={styles.feed}>
            <h4>{t.feed.title}</h4>
            <ul aria-live="polite" role="log" data-testid="maze-learner-feed">
              {state.feed
                .slice(-3)
                .reverse()
                .map((ev, idx) => (
                  <li key={`${state.feed.length}-${idx}-${ev.k}`}>{describe(ev, state, t)}</li>
                ))}
            </ul>
          </div>
          <details className={styles.help}>
            <summary>{t.helpTitle}</summary>
            <p>{t.legend}</p>
            <p>{t.epsilonHelp}</p>
            <p>{t.discountHelp}</p>
            {over ? null : <p>{t.keys}</p>}
          </details>
        </div>
      </div>
    </SystemWindow>
  );
}
