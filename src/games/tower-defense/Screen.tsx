/**
 * Hold the Haven's Screen: the board on a canvas, the tower cards, the pad controls,
 * the game controls and a polite live feed. The rules live in engine.ts; this file
 * turns real time into ticks (useFixedStep), draws (draw.ts) and maps keys, taps
 * and buttons to engine actions.
 *
 * Keys (on the game root, ignored in text fields): arrows move the pad cursor,
 * 1 to 8 pick the n-th tower (and place it on the cursor pad when it is free and
 * affordable), Enter or Space place the picked tower or upgrade the one under the
 * cursor, S or Delete sell it, Escape clears the pick, P pauses, N calls the next
 * wave, X changes the speed. Every key has a button.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useCanvas } from '../ui/useCanvas';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import { drawFrame, drawStatic, geometry, newFx, type Palette, type View } from './draw';
import { COLS, bestPad, callWaveBonus, engine, placeCost, refund, upgradeCost, type Member, type TDState, type TowerKind } from './engine';
import { GLYPH, TOWER_FALLBACK, TOWER_TOKEN } from './glyphs';
import game from './manifest';
import { feedText, nextPad, type Dir } from './screenLogic';
import { strings } from './strings';
import styles from './Screen.module.css';

const KINDS = Object.keys(TOWER_TOKEN) as TowerKind[];
const SHOWN_LINES = 4;
const DIRS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/** The colours the canvas uses, read from the design tokens once per game. */
function readPalette(letters: Record<TowerKind, string>): Palette {
  const css = getComputedStyle(document.documentElement);
  const tok = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const tower = {} as Record<TowerKind, string>;
  for (const k of KINDS) tower[k] = tok(TOWER_TOKEN[k], TOWER_FALLBACK[k]);
  return {
    bg: tok('--color-bg', '#0f0f14'),
    grass: tok('--color-panel', '#1a1a24'),
    grassAlt: tok('--color-panel-raised', '#22222f'),
    path: tok('--color-border', '#2c2c3c'),
    pathEdge: tok('--color-muted', '#9a9ab0'),
    text: tok('--color-text', '#e8e8f0'),
    muted: tok('--color-muted', '#9a9ab0'),
    accent: tok('--color-accent-2', '#ffb84d'),
    danger: tok('--color-danger', '#ff6b85'),
    success: tok('--color-success', '#4dff9a'),
    panel: tok('--color-panel-raised', '#22222f'),
    tower,
    letters,
    monster: [
      tok('--color-danger', '#ff6b85'),
      tok('--color-info', '#7cc6ff'),
      tok('--color-accent-2', '#ffb84d'),
      tok('--color-success', '#4dff9a'),
      tok('--color-accent-text', '#b8a6ff'),
      tok('--color-muted', '#9a9ab0'),
      tok('--color-text', '#e8e8f0'),
    ],
  };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

interface Note {
  id: number;
  /** The engine's feed counter when the note was written: it sorts after that engine line. */
  after: number;
  text: string;
}

function GlyphIcon({ kind }: { kind: TowerKind }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ color: `var(${TOWER_TOKEN[kind]})` }}>
      <path d={GLYPH[kind]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TowerDefenseScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const { ref: canvasRef, size } = useCanvas();
  const [paused, setPaused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>(() => [{ id: 0, after: 0, text: s.feed.ready }]);

  // Latest values for handlers and the draw loop (written after each commit).
  const stateRef = useRef<TDState>(state);
  const prevState = useRef<TDState>(state);
  const cursorRef = useRef(cursor);
  const pickedRef = useRef(picked);
  const pausedRef = useRef(paused);
  const noteId = useRef(1);
  const boardRef = useRef<HTMLDivElement>(null);

  const cards = useMemo(() => state.members.filter((m) => m.kind !== null), [state.members]);
  const pickedMember = picked === null ? undefined : state.members.find((m) => m.id === picked);
  const towerHere = state.towers.find((t) => t.pad === cursor);
  const over = outcome !== null;
  const running = !over && !paused;

  const note = useCallback((text: string) => {
    setNotes((all) => [...all.slice(-(SHOWN_LINES - 1)), { id: noteId.current++, after: stateRef.current.feedSeq, text }]);
  }, []);

  // ---- actions -----------------------------------------------------------
  const placeOn = useCallback(
    (member: Member, pad: number) => {
      const st = stateRef.current;
      if (st.result !== null || member.kind === null) return;
      if (st.towers.some((t) => t.pad === pad)) {
        note(formatText(s.feed.padTaken, { pad: pad + 1 }));
        return;
      }
      const cost = placeCost(member);
      if (st.glow < cost) {
        note(formatText(s.feed.noGlow, { tower: s.towers[member.kind].name, cost, glow: st.glow }));
        return;
      }
      dispatch({ type: 'place', pad, member: member.id });
    },
    [dispatch, note, s],
  );

  const pickCard = useCallback(
    (member: Member) => {
      if (stateRef.current.result !== null || member.kind === null) return;
      setPicked(member.id);
      const pad = cursorRef.current;
      if (stateRef.current.towers.some((t) => t.pad === pad)) note(formatText(s.feed.picked, { tower: s.towers[member.kind].name }));
      else placeOn(member, pad);
    },
    [note, placeOn, s],
  );

  const upgradeHere = useCallback(() => {
    const st = stateRef.current;
    const t = st.towers.find((x) => x.pad === cursorRef.current);
    if (!t) return note(s.feed.noTower);
    const cost = upgradeCost(t);
    if (cost === null) return note(s.feed.maxLevel);
    if (st.glow < cost) return note(formatText(s.feed.noGlowUp, { cost, glow: st.glow }));
    dispatch({ type: 'upgrade', pad: t.pad });
  }, [dispatch, note, s]);

  const sellHere = useCallback(() => {
    const t = stateRef.current.towers.find((x) => x.pad === cursorRef.current);
    if (!t) return note(s.feed.noTower);
    dispatch({ type: 'sell', pad: t.pad });
  }, [dispatch, note, s]);

  const confirmHere = useCallback(() => {
    const st = stateRef.current;
    const member = pickedRef.current === null ? undefined : st.members.find((m) => m.id === pickedRef.current);
    if (st.towers.some((t) => t.pad === cursorRef.current)) upgradeHere();
    else if (member) placeOn(member, cursorRef.current);
    else note(s.feed.noPick);
  }, [note, placeOn, s, upgradeHere]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    setPaused(next);
    note(next ? s.feed.paused : s.feed.resumed);
  }, [note, s]);

  const toggleSpeed = useCallback(() => {
    const next = stateRef.current.speed === 1 ? 2 : 1;
    dispatch({ type: 'setSpeed', speed: next });
    note(formatText(s.feed.speed, { n: next }));
  }, [dispatch, note, s]);

  const callNext = useCallback(() => {
    const st = stateRef.current;
    if (callWaveBonus(st) === null) note(st.started >= st.total ? s.feed.noWave : s.feed.waveBusy);
    else dispatch({ type: 'callWave' });
  }, [dispatch, note, s]);

  const move = useCallback((dir: Dir) => setCursor((c) => nextPad(stateRef.current.pads, c, dir)), []);
  const step = useCallback((by: 1 | -1) => setCursor((c) => (c + by + stateRef.current.pads.length) % stateRef.current.pads.length), []);

  // ---- keyboard (on the game root) ----------------------------------------
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target) || stateRef.current.result !== null) return;
      const dir = DIRS[e.key];
      let handled = true;
      if (dir) move(dir);
      else if (/^[1-8]$/.test(e.key)) {
        const member = cards[Number(e.key) - 1];
        if (member) pickCard(member);
        else handled = false;
      } else if (e.key === 'Enter' || e.key === ' ') {
        // On a button these keep their own meaning; on the board they place or upgrade.
        if (e.target === boardRef.current) confirmHere();
        else handled = false;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'Delete') sellHere();
      else if (e.key === 'Escape') {
        setPicked(null);
        note(s.feed.cleared);
      } else if (e.key === 'p' || e.key === 'P') togglePause();
      else if (e.key === 'n' || e.key === 'N') callNext();
      else if (e.key === 'x' || e.key === 'X') toggleSpeed();
      else handled = false;
      if (handled) e.preventDefault();
    },
    [callNext, cards, confirmHere, move, note, pickCard, s, sellHere, toggleSpeed, togglePause],
  );

  // ---- taps on the board ---------------------------------------------------
  const onBoardPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.focus({ preventScroll: true });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { cell, ox, oy } = geometry(rect.width, rect.height);
      const x = (e.clientX - rect.left - ox) / cell;
      const y = (e.clientY - rect.top - oy) / cell;
      let best = -1;
      let bestD = 0.8 * 0.8;
      stateRef.current.pads.forEach((c, i) => {
        const dx = x - ((c % COLS) + 0.5);
        const dy = y - (Math.floor(c / COLS) + 0.5);
        if (dx * dx + dy * dy < bestD) {
          bestD = dx * dx + dy * dy;
          best = i;
        }
      });
      if (best >= 0) setCursor(best);
    },
    [canvasRef],
  );

  // ---- the clock and the drawing -------------------------------------------
  const palette = useState(() => readPalette(Object.fromEntries(KINDS.map((k) => [k, s.towers[k].letter])) as Record<TowerKind, string>))[0];
  const fx = useState(newFx)[0];
  const prevPos = useState(() => new Map<number, number>())[0];
  const base = useRef<HTMLCanvasElement | null>(null);
  const baseKey = useRef('');
  const hintPad = state.hintsLeft > 0 && picked !== null ? (bestPad(state, picked) ?? -1) : -1;
  const view = useRef<View>({ alpha: 1, reduced: reducedMotion, cursor, pickedKind: null, pickedPower: 0, hintPad: -1, prevPos, fx });

  useEffect(() => {
    prevState.current = stateRef.current;
    stateRef.current = state;
    prevPos.clear();
    for (const e of prevState.current.enemies) prevPos.set(e.id, e.pos);
  }, [state, prevPos]);
  useEffect(() => {
    cursorRef.current = cursor;
    pickedRef.current = picked;
    pausedRef.current = paused;
    view.current.reduced = reducedMotion;
    view.current.cursor = cursor;
    view.current.pickedKind = pickedMember?.kind ?? null;
    view.current.pickedPower = pickedMember?.power ?? 0;
    view.current.hintPad = hintPad;
  });

  const paint = useCallback(
    (alpha: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || size.width === 0) return;
      // The static layer (grass, road, Haven, pads) is drawn once per size into an offscreen canvas.
      const key = `${size.width}x${size.height}@${size.dpr}`;
      if (baseKey.current !== key || !base.current) {
        const off = base.current ?? document.createElement('canvas');
        off.width = Math.round(size.width * size.dpr);
        off.height = Math.round(size.height * size.dpr);
        const octx = off.getContext('2d');
        if (octx) {
          octx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
          drawStatic(octx, size.width, size.height, stateRef.current, palette);
        }
        base.current = off;
        baseKey.current = key;
      }
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      view.current.alpha = reducedMotion ? 1 : alpha;
      drawFrame(ctx, size.width, size.height, base.current, stateRef.current, palette, view.current);
    },
    [canvasRef, size, palette, reducedMotion],
  );

  const ticksPerStep = state.speed;
  useFixedStep(
    () => {
      for (let i = 0; i < ticksPerStep; i++) dispatch({ type: 'tick' });
    },
    { running, onFrame: paint },
  );
  // A new size, or not running (paused, over): draw the tick itself. While running, the next frame draws.
  useEffect(() => paint(1), [paint]);
  useEffect(() => {
    if (!running) paint(1);
  }, [running, paint, state, cursor, picked]);

  // ---- text -----------------------------------------------------------------
  const left = state.waveAt >= 0 ? Math.max(0, Math.ceil((state.waveAt - state.tick) / 20)) : -1;
  const hud = [
    formatText(s.hud.wave, { n: state.started, total: state.total }),
    formatText(s.hud.haven, { hp: state.havenHp, max: state.havenMax }),
    formatText(s.hud.glow, { n: state.glow }),
    over ? null : left >= 0 ? formatText(s.hud.nextIn, { s: left }) : s.hud.under,
  ]
    .filter(Boolean)
    .join(' · ');
  const padText = towerHere
    ? formatText(s.pad.taken, {
        tower: s.towers[towerHere.kind].name,
        name: state.members.find((m) => m.id === towerHere.member)?.name ?? '',
        level: towerHere.level,
      })
    : s.pad.free;
  const padStatus = `${formatText(s.pad.status, { pad: cursor + 1, total: state.pads.length })}: ${padText}`;
  const upCost = towerHere ? upgradeCost(towerHere) : null;
  const bonus = callWaveBonus(state);

  const lines = useMemo(() => {
    const all = [
      ...state.feed.map((l) => ({ key: `e${l.seq}`, order: l.seq, text: feedText(l, s) })),
      ...notes.map((n) => ({ key: `n${n.id}`, order: n.after + 0.5 + n.id / 1000, text: n.text })),
    ];
    return all.sort((a, b) => a.order - b.order).slice(-SHOWN_LINES);
  }, [state.feed, notes, s]);

  return (
    <div className={cx(styles.game, reducedMotion && styles.still)} onKeyDown={onKeyDown} data-testid="td-root" data-tick={state.tick} data-paused={paused ? 'true' : 'false'}>
      <SystemWindow
        title={game.manifest.name[locale]}
        headingLevel={2}
        tone={outcome?.result === 'won' ? 'success' : 'default'}
        actions={
          <>
            {over ? null : (
              <button type="button" className="btn btn--danger" onClick={() => dispatch({ type: 'forfeit' })}>
                {s.controls.giveUp}
              </button>
            )}
            <button type="button" className="btn" onClick={exit}>
              {s.controls.leave}
            </button>
          </>
        }
      >
        <p className={styles.intro}>{s.intro}</p>
        <p className={styles.hud} data-testid="td-hud">
          {hud}
        </p>

        <div className={styles.layout}>
          <div className={styles.stage}>
            <div
              ref={boardRef}
              className={styles.boardWrap}
              tabIndex={0}
              role="group"
              aria-label={game.manifest.name[locale]}
              data-testid="td-board"
              onPointerDown={onBoardPointer}
            >
              <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={formatText(s.board, { pad: padStatus, n: cards.length })} />
            </div>

            <div className={styles.padBar}>
              <p className={styles.padStatus} aria-live="polite" data-testid="td-pad">
                {padStatus}
              </p>
              <button type="button" className="btn" onClick={() => step(-1)}>
                {s.controls.prev}
              </button>
              <button type="button" className="btn" onClick={() => step(1)}>
                {s.controls.next}
              </button>
              <button type="button" className="btn" onClick={upgradeHere} disabled={over}>
                {upCost === null && towerHere ? s.controls.upgradeMax : formatText(s.controls.upgrade, { cost: upCost ?? '-' })}
              </button>
              <button type="button" className="btn" onClick={sellHere} disabled={over}>
                {formatText(s.controls.sell, { glow: towerHere ? refund(towerHere) : 0 })}
              </button>
            </div>
          </div>

          <div className={styles.side}>
            <h3 className={styles.subtitle}>{s.sections.towers}</h3>
            {cards.length === 0 ? (
              <p className="muted">{s.cards.none}</p>
            ) : (
              <ul className={styles.cards}>
                {cards.map((m, i) => {
                  const cost = placeCost(m);
                  const kind = m.kind!;
                  const poor = state.glow < cost;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={cx('btn', styles.card, poor && styles.poor, picked === m.id && styles.picked)}
                        aria-pressed={picked === m.id}
                        aria-keyshortcuts={String(i + 1)}
                        disabled={over}
                        onClick={() => pickCard(m)}
                      >
                        <span className={styles.cardTop}>
                          <span className={styles.key}>{i + 1}</span>
                          <GlyphIcon kind={kind} />
                          <span className={styles.letter}>{s.towers[kind].letter}</span>
                        </span>
                        <span className={styles.cardName}>{s.towers[kind].name}</span>
                        <span className={styles.cardMember}>{m.name}</span>
                        <span className={styles.cardCost}>{formatText(s.cards.cost, { cost })}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {over ? null : (
              <div className={styles.controls}>
                <button type="button" className="btn" aria-pressed={paused} onClick={togglePause}>
                  {s.controls.pause}
                </button>
                <button type="button" className="btn" onClick={toggleSpeed}>
                  {formatText(s.controls.speed, { n: state.speed })}
                </button>
                <button type="button" className={cx('btn', styles.wide)} onClick={callNext}>
                  {formatText(s.controls.nextWave, { glow: bonus ?? 0 })}
                </button>
              </div>
            )}

            {outcome ? (
              <p className={styles.banner} role="status" data-result={outcome.result}>
                {s.end[outcome.result]}
              </p>
            ) : null}

            <h3 className={styles.subtitle}>{s.sections.feed}</h3>
            <ol className={styles.feed} aria-live="polite" data-testid="td-feed">
              {lines.map((l) => (
                <li key={l.key}>{l.text}</li>
              ))}
            </ol>
          </div>
        </div>
      </SystemWindow>
    </div>
  );
}
