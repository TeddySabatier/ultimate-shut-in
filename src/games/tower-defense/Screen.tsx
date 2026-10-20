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
 *
 * Drawing reads two states that this file keeps itself, `cur` and `prev`: every
 * action goes to React (`dispatch`) and, at the same moment, to a copy of the state
 * (`engine.reduce` is pure, so both agree). The frame that follows a tick therefore
 * interpolates between the true previous and current ticks, with no wait for React's
 * next render.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useCanvas } from '../ui/useCanvas';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import { drawFrame, drawStatic, geometry, newFx, type Palette, type View } from './draw';
import { COLS, bestPad, callWaveBonus, engine, placeCost, refund, upgradeCost, type Member, type TDAction, type TDState, type TowerKind } from './engine';
import { GLYPH, TOWER_FALLBACK, TOWER_TOKEN } from './glyphs';
import game from './manifest';
import { feedText, nextPad, type Dir } from './screenLogic';
import { strings } from './strings';
import styles from './Screen.module.css';

const KINDS = Object.keys(TOWER_TOKEN) as TowerKind[];
const SHOWN_LINES = 4;
const DIRS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/** The colours the canvas uses, read from the design tokens once per game. */
function readPalette(letters: Record<TowerKind, string>, slowMark: string): Palette {
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
    slowMark,
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

  // The state the handlers and the canvas read: updated at the moment of each action, not at React's next render.
  const cur = useRef<TDState>(state);
  const prev = useRef<TDState>(state);
  const cursorRef = useRef(cursor);
  const pickedRef = useRef(picked);
  const noteId = useRef(1);
  const boardRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);

  const send = useCallback(
    (action: TDAction) => {
      dispatch(action);
      cur.current = engine.reduce(cur.current, action);
    },
    [dispatch],
  );

  const cards = useMemo(() => state.members.filter((m) => m.kind !== null), [state.members]);
  const pickedMember = picked === null ? undefined : state.members.find((m) => m.id === picked);
  const towerHere = state.towers.find((t) => t.pad === cursor);
  const over = outcome !== null;
  const running = !over && !paused;
  // The star: the best pad of the picked card, while a hint is left.
  const hintPad = state.hintsLeft > 0 && picked !== null ? (bestPad(state, picked) ?? -1) : -1;

  const note = useCallback((text: string) => {
    setNotes((all) => [...all.slice(-(SHOWN_LINES - 1)), { id: noteId.current++, after: cur.current.feedSeq, text }]);
  }, []);

  const select = useCallback((id: string | null) => {
    pickedRef.current = id;
    setPicked(id);
  }, []);
  const moveTo = useCallback((pad: number) => {
    cursorRef.current = pad;
    setCursor(pad);
  }, []);

  // ---- actions -----------------------------------------------------------
  const placeOn = useCallback(
    (member: Member, pad: number) => {
      const st = cur.current;
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
      // A hint is spent only on the pad the player was shown: the star of the picked card.
      const hinted = st.hintsLeft > 0 && pickedRef.current === member.id && bestPad(st, member.id) === pad;
      send(hinted ? { type: 'place', pad, member: member.id, hinted: true } : { type: 'place', pad, member: member.id });
    },
    [note, s, send],
  );

  const pickCard = useCallback(
    (member: Member) => {
      const st = cur.current;
      if (st.result !== null || member.kind === null) return;
      const name = s.towers[member.kind].name;
      if (st.hintsLeft > 0) {
        const best = bestPad(st, member.id);
        if (best !== null && pickedRef.current !== member.id) {
          // First tap with a hint left: pick the card and show the star, place nothing yet.
          select(member.id);
          moveTo(best);
          note(formatText(s.feed.hint, { tower: name, n: best + 1 }));
          return;
        }
        select(member.id);
        placeOn(member, cursorRef.current);
        return;
      }
      select(member.id);
      if (st.towers.some((t) => t.pad === cursorRef.current)) note(formatText(s.feed.picked, { tower: name }));
      else placeOn(member, cursorRef.current);
    },
    [moveTo, note, placeOn, s, select],
  );

  const upgradeHere = useCallback(() => {
    const st = cur.current;
    const t = st.towers.find((x) => x.pad === cursorRef.current);
    if (!t) return note(s.feed.noTower);
    const cost = upgradeCost(t);
    if (cost === null) return note(s.feed.maxLevel);
    if (st.glow < cost) return note(formatText(s.feed.noGlowUp, { cost, glow: st.glow }));
    send({ type: 'upgrade', pad: t.pad });
  }, [note, s, send]);

  const sellHere = useCallback(() => {
    const st = cur.current;
    const t = st.towers.find((x) => x.pad === cursorRef.current);
    if (!t) return note(s.feed.noTower);
    if (st.tick < t.jamUntil) return note(s.feed.jammedSell);
    send({ type: 'sell', pad: t.pad });
  }, [note, s, send]);

  const confirmHere = useCallback(() => {
    const st = cur.current;
    const member = pickedRef.current === null ? undefined : st.members.find((m) => m.id === pickedRef.current);
    if (st.towers.some((t) => t.pad === cursorRef.current)) upgradeHere();
    else if (member) placeOn(member, cursorRef.current);
    else note(s.feed.noPick);
  }, [note, placeOn, s, upgradeHere]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current === paused) return;
    announced.current = paused;
    note(paused ? s.feed.paused : s.feed.resumed);
  }, [paused, note, s]);

  const toggleSpeed = useCallback(() => {
    const next = cur.current.speed === 1 ? 2 : 1;
    send({ type: 'setSpeed', speed: next });
    note(formatText(s.feed.speed, { n: next }));
  }, [note, s, send]);

  const callNext = useCallback(() => {
    const st = cur.current;
    if (callWaveBonus(st) === null) note(st.started >= st.total ? s.feed.noWave : s.feed.waveBusy);
    else send({ type: 'callWave' });
  }, [note, s, send]);

  const move = useCallback((dir: Dir) => moveTo(nextPad(cur.current.pads, cursorRef.current, dir)), [moveTo]);
  const step = useCallback((by: 1 | -1) => moveTo((cursorRef.current + by + cur.current.pads.length) % cur.current.pads.length), [moveTo]);

  // ---- keyboard (on the game root) ----------------------------------------
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target) || cur.current.result !== null) return;
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
        select(null);
        note(s.feed.cleared);
      } else if (e.key === 'p' || e.key === 'P') togglePause();
      else if (e.key === 'n' || e.key === 'N') callNext();
      else if (e.key === 'x' || e.key === 'X') toggleSpeed();
      else handled = false;
      if (handled) e.preventDefault();
    },
    [callNext, cards, confirmHere, move, note, pickCard, s, select, sellHere, toggleSpeed, togglePause],
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
      cur.current.pads.forEach((c, i) => {
        const dx = x - ((c % COLS) + 0.5);
        const dy = y - (Math.floor(c / COLS) + 0.5);
        if (dx * dx + dy * dy < bestD) {
          bestD = dx * dx + dy * dy;
          best = i;
        }
      });
      if (best >= 0) moveTo(best);
    },
    [canvasRef, moveTo],
  );

  // ---- the clock and the drawing -------------------------------------------
  const palette = useState(() =>
    readPalette(Object.fromEntries(KINDS.map((k) => [k, s.towers[k].letter])) as Record<TowerKind, string>, s.marks.slowed),
  )[0];
  const fx = useState(newFx)[0];
  const prevPos = useState(() => new Map<number, number>())[0];
  const base = useRef<HTMLCanvasElement | null>(null);
  const baseKey = useRef('');
  const view = useRef<View>({ alpha: 1, reduced: reducedMotion, cursor, pickedKind: null, pickedPower: 0, hintPad: -1, prevPos, fx });

  useEffect(() => {
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
          drawStatic(octx, size.width, size.height, cur.current, palette);
        }
        base.current = off;
        baseKey.current = key;
      }
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      view.current.alpha = reducedMotion ? 1 : alpha;
      drawFrame(ctx, size.width, size.height, base.current, cur.current, palette, view.current);
    },
    [canvasRef, size, palette, reducedMotion],
  );

  // One clock step: `speed` ticks. `prev` is the state the step starts from, so the frames that follow
  // draw from it to the new `cur` (a x2 step moves two ticks in the same 50 ms).
  useFixedStep(
    () => {
      prev.current = cur.current;
      prevPos.clear();
      for (const e of prev.current.enemies) prevPos.set(e.id, e.pos);
      for (let i = 0, n = cur.current.speed; i < n; i++) send({ type: 'tick' });
    },
    { running, onFrame: paint },
  );
  // A new size, or not running (paused, over): draw the tick itself. While running, the next frame draws.
  useEffect(() => paint(1), [paint]);
  useEffect(() => {
    if (!running) paint(1);
  }, [running, paint, state, cursor, picked]);

  // When the game ends its buttons go away: keep the focus on the result line.
  useEffect(() => {
    if (over) bannerRef.current?.focus();
  }, [over]);

  // ---- text -----------------------------------------------------------------
  const left = state.waveAt >= 0 ? Math.max(0, Math.ceil((state.waveAt - state.tick) / 20)) : -1;
  const hud = [
    formatText(s.hud.wave, { n: state.started, total: state.total }),
    formatText(s.hud.haven, { hp: state.havenHp, max: state.havenMax }),
    formatText(s.hud.glow, { n: state.glow }),
    state.hintsLeft > 0 ? formatText(s.hud.hints, { n: state.hintsLeft }) : null,
    over ? null : left >= 0 ? formatText(s.hud.nextIn, { s: left }) : s.hud.under,
  ]
    .filter(Boolean)
    .join(s.hud.separator);
  const jammed = towerHere !== undefined && state.tick < towerHere.jamUntil;
  let padText = s.pad.free;
  if (towerHere) {
    padText = formatText(jammed ? s.pad.takenJammed : s.pad.taken, {
      tower: s.towers[towerHere.kind].name,
      name: state.members.find((m) => m.id === towerHere.member)?.name ?? '',
      level: towerHere.level,
    });
  }
  if (cursor === hintPad) padText = formatText(s.pad.withHint, { text: padText, hint: s.pad.hint });
  const padStatus = formatText(s.pad.line, { status: formatText(s.pad.status, { pad: cursor + 1, total: state.pads.length }), text: padText });
  // What the picked card (else the tower under the cursor) does, in words.
  const infoKind = pickedMember?.kind ?? towerHere?.kind ?? null;
  const info = infoKind ? formatText(s.pad.blurb, { tower: s.towers[infoKind].name, blurb: s.towers[infoKind].blurb }) : '';
  const boardHint = hintPad >= 0 && pickedMember?.kind ? formatText(s.pad.boardHint, { tower: s.towers[pickedMember.kind].name, n: hintPad + 1 }) : '';
  const upCost = towerHere ? upgradeCost(towerHere) : null;
  const upLabel = !towerHere ? s.controls.upgradeNone : upCost === null ? s.controls.upgradeMax : formatText(s.controls.upgrade, { cost: upCost });
  const sellLabel = towerHere && !jammed ? formatText(s.controls.sell, { glow: refund(towerHere) }) : s.controls.sellNone;
  const bonus = callWaveBonus(state);
  const nextLabel = bonus ? formatText(s.controls.nextWave, { glow: bonus }) : s.controls.nextWaveNone;

  const lines = useMemo(() => {
    // Engine lines and notes in the order they happened: a note sorts after the engine line it followed.
    const all: Array<{ key: string; at: number; kind: 0 | 1; id: number; text: string }> = [
      ...state.feed.map((l) => ({ key: `e${l.seq}`, at: l.seq, kind: 0 as const, id: l.seq, text: feedText(l, s) })),
      ...notes.map((n) => ({ key: `n${n.id}`, at: n.after, kind: 1 as const, id: n.id, text: n.text })),
    ];
    return all.sort((a, b) => a.at - b.at || a.kind - b.kind || a.id - b.id).slice(-SHOWN_LINES);
  }, [state.feed, notes, s]);

  return (
    <div className={styles.game} onKeyDown={onKeyDown} data-testid="td-root" data-tick={state.tick} data-paused={paused ? 'true' : 'false'}>
      <SystemWindow
        title={game.manifest.name[locale]}
        headingLevel={2}
        tone={outcome?.result === 'won' ? 'success' : 'default'}
        actions={
          <>
            {over ? null : (
              <button type="button" className="btn btn--danger" onClick={() => send({ type: 'forfeit' })}>
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
              <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={formatText(s.board, { pad: padStatus, hint: boardHint, n: cards.length })} />
            </div>

            <div className={styles.padBar}>
              <p className={styles.padStatus} aria-live="polite" data-testid="td-pad">
                {padStatus}
              </p>
              {info ? (
                <p className={cx('muted', styles.padInfo)} data-testid="td-info">
                  {info}
                </p>
              ) : null}
              <button type="button" className="btn" onClick={() => step(-1)}>
                {s.controls.prev}
              </button>
              <button type="button" className="btn" onClick={() => step(1)}>
                {s.controls.next}
              </button>
              <button type="button" className="btn" onClick={upgradeHere} disabled={over}>
                {upLabel}
              </button>
              <button type="button" className="btn" onClick={sellHere} disabled={over}>
                {sellLabel}
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
                  {nextLabel}
                </button>
              </div>
            )}

            {outcome ? (
              <p ref={bannerRef} tabIndex={-1} className={styles.banner} role="status" data-result={outcome.result}>
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
