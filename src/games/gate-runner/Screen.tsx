/**
 * Haven Rush Screen: the lane on a canvas, the squad and boss numbers as text next to it, a polite
 * live feed, and the controls. The rules live in engine.ts; this file turns real time into 50 ms ticks
 * (useFixedStep), draws (draw.ts) and maps keys, taps, drags and buttons to engine actions.
 *
 * Pick a side: Left and Right arrows or A and D, the two side buttons, or a tap or drag on the lane.
 * P (or Space on the page) pauses, and every key has a button.
 *
 * Drawing reads two states this file keeps itself, `prev` and `cur`: every action goes to React
 * (`dispatch`) and, at the same moment, to a copy (`engine.reduce` is pure, so both agree), so the
 * frame after a tick interpolates between the true previous and current ticks.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Meter } from '../../components/Meter';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useCanvas } from '../ui/useCanvas';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import { drawFrame, gateTexts, newFx, noteTick, num, type Palette, type View } from './draw';
import { bestSide, engine, formatOp, isOver, nextGate, previewPairs, type GateRunnerAction } from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

/** The colours the canvas uses, read from the design tokens once per game. */
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const tok = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: tok('--color-bg', '#0f0f14'),
    lane: tok('--color-panel', '#1a1a24'),
    laneAlt: tok('--color-panel-raised', '#22222f'),
    rail: tok('--color-border-light', '#6b6b8a'),
    text: tok('--color-text', '#e8e8f0'),
    muted: tok('--color-muted', '#9a9ab0'),
    ink: tok('--color-bg', '#0f0f14'),
    accent: tok('--color-accent', '#7c5cff'),
    good: tok('--color-info', '#7cc6ff'),
    bad: tok('--color-danger', '#ff6b85'),
    ok: tok('--color-success', '#4dff9a'),
    squad: tok('--color-accent-2', '#ffb84d'),
    boss: tok('--color-accent-text', '#b8a6ff'),
  };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

export default function HavenRushScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const t = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const { ref: canvasRef, size } = useCanvas();
  const [paused, setPaused] = useState(false);

  // The state the handlers and the canvas read: updated at the moment of each action, not at React's next render.
  const cur = useRef(state);
  const prev = useRef(state);
  const pausedRef = useRef(false);
  const fx = useState(newFx)[0];
  const palette = useState(readPalette)[0];
  const texts = useMemo(() => gateTexts(state.gates), [state.gates]);
  const [hintSide, setHintSide] = useState<-1 | 0 | 1>(() => (state.hints > 0 ? bestSide(state) : -1));
  const hintGate = useRef(state.gi);
  const view = useRef<View>({ alpha: 1, reduced: reducedMotion, hint: hintSide, texts, bossLabel: '' });
  const bannerRef = useRef<HTMLParagraphElement>(null);

  const send = useCallback(
    (action: GateRunnerAction) => {
      dispatch(action);
      cur.current = engine.reduce(cur.current, action);
    },
    [dispatch],
  );

  const over = outcome !== null;
  const running = !over && !paused;

  const choose = useCallback(
    (side: 0 | 1) => {
      if (pausedRef.current || isOver(cur.current)) return;
      send({ type: 'side', side });
    },
    [send],
  );
  const togglePause = useCallback(() => {
    if (isOver(cur.current)) return;
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  // ---- keyboard (the whole page; ignored in text fields) ---------------------
  useEffect(() => {
    if (over) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        choose(0);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        choose(1);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePause();
      } else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, choose, togglePause]);

  // ---- taps and drags on the lane ----------------------------------------------
  const onLane = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (e.type === 'pointermove' && e.buttons === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      choose(e.clientX - rect.left < rect.width / 2 ? 0 : 1);
    },
    [choose],
  );

  // ---- the clock and the drawing ---------------------------------------------------
  const paint = useCallback(
    (alpha: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || size.width === 0) return;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      const v = view.current;
      v.alpha = reducedMotion ? 1 : alpha;
      drawFrame(ctx, size.width, size.height, prev.current, cur.current, palette, v, fx);
    },
    [canvasRef, size, palette, fx, reducedMotion],
  );

  useEffect(() => {
    view.current.reduced = reducedMotion;
    view.current.hint = hintSide;
    view.current.texts = texts;
    view.current.bossLabel = `${num(state.bossHp)}`;
  });

  const onTick = useCallback(() => {
    prev.current = cur.current;
    send({ type: 'tick' });
    noteTick(fx, prev.current, cur.current, reducedMotion);
    // The hint arrow is looked up once per gate, not per frame.
    if (cur.current.gi !== hintGate.current) {
      hintGate.current = cur.current.gi;
      setHintSide(cur.current.hints > 0 && !isOver(cur.current) ? bestSide(cur.current) : -1);
    }
  }, [send, fx, reducedMotion]);

  useFixedStep(onTick, { running, onFrame: paint });
  // A new size, or not running (paused, over): draw the tick itself. While running, the next frame draws.
  useEffect(() => paint(1), [paint]);
  useEffect(() => {
    if (!running) paint(1);
  }, [running, paint, state]);

  // When the game ends its buttons go away: keep the focus on the result line.
  useEffect(() => {
    if (over) bannerRef.current?.focus();
  }, [over]);

  // ---- text -------------------------------------------------------------------------
  const g = nextGate(state);
  const boss = state.phase === 'boss';
  const preview = state.study && !over ? previewPairs(state) : [];
  const sideWord = (s: 0 | 1) => (s === 0 ? t.left : t.right).toLowerCase();
  const status = paused ? t.feed.paused : over ? '' : boss ? t.bossFight : g ? formatText(t.nextGates, { left: formatOp(g.l), right: formatOp(g.r) }) : t.noMoreGates;
  const recent = state.events.slice(-3);
  const live = recent.map((e, i) => {
    let text: string;
    if (e.t === 'gate') text = formatText(t.log.gate, { op: e.op, before: e.a, after: e.b });
    else if (e.t === 'hit') text = formatText(e.op === 'wall' ? t.log.hitWall : t.log.hitCrowd, { n: e.a });
    else if (e.t === 'pick') text = formatText(e.op === 'rapid' ? t.log.pickRapid : t.log.pickMembers, { n: e.a });
    else text = t.log.revive;
    return { key: `${e.at}-${e.t}-${e.a}-${e.b}-${i}`, text };
  });
  const canvasLabel = boss
    ? formatText(t.canvasLabelBoss, { n: state.squad, hp: state.bossHp })
    : formatText(t.canvasLabel, { n: state.squad, left: g ? formatOp(g.l) : '-', right: g ? formatOp(g.r) : '-', hp: state.bossHp });

  return (
    <SystemWindow
      className={styles.wrap}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={outcome?.result === 'won' ? 'success' : 'default'}
      data-testid="gr-root"
      data-step={state.step}
      actions={
        <>
          {over ? null : (
            <button type="button" className="btn btn--danger" onClick={() => send({ type: 'forfeit' })}>
              {t.forfeit}
            </button>
          )}
          <button type="button" className="btn" onClick={exit}>
            {t.leave}
          </button>
        </>
      }
    >
      <p className={styles.intro}>{t.intro}</p>

      <div className={styles.layout}>
        <div className={styles.stage}>
          <div className={styles.hud}>
            <p className={styles.squad} data-testid="gr-squad">
              {formatText(t.squad, { n: state.squad })}
            </p>
            <Meter label={t.bossName} value={state.bossHp} max={state.bossMax} tone="attack" size="sm" text={formatText(t.boss, { hp: state.bossHp, max: state.bossMax })} className={styles.bossBar} />
          </div>
          <div className={styles.board}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              role="img"
              aria-label={canvasLabel}
              data-testid="gr-canvas"
              onPointerDown={onLane}
              onPointerMove={onLane}
            />
          </div>
        </div>

        <div className={styles.side}>
          <div className={cx(styles.feed, !status && live.length === 0 && styles.feedEmpty)} aria-live="polite" data-testid="gr-feed">
            {status ? <p className={styles.status}>{status}</p> : null}
            <ul className={styles.events}>
              {live.map((l) => (
                <li key={l.key}>{l.text}</li>
              ))}
            </ul>
          </div>

          <ul className={styles.flags}>
            {state.shield > 0 ? <li className={styles.flag}>{formatText(t.shield, { n: state.shield })}</li> : null}
            {state.revives > 0 ? <li className={styles.flag}>{formatText(t.revive, { n: state.revives })}</li> : null}
            {state.rapid > 0 ? <li className={styles.flag}>{t.rapid}</li> : null}
            {hintSide >= 0 && state.hints > 0 && !boss ? <li className={styles.flag}>{formatText(t.hint, { side: sideWord(hintSide as 0 | 1) })}</li> : null}
          </ul>

          {preview.length > 0 ? (
            <div className={styles.study}>
              <h3 className={styles.studyTitle}>{t.studyTitle}</h3>
              <ul className={styles.studyList}>
                {preview.map((p) => (
                  <li key={`${p.left}-${p.right}-${p.leftN}-${p.rightN}`}>{formatText(t.studyPair, p)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {outcome ? (
            <p ref={bannerRef} tabIndex={-1} className={styles.banner} role="status" data-result={outcome.result}>
              {t.end[outcome.result]}
            </p>
          ) : (
            <>
              <div className={styles.pad}>
                <button type="button" className={cx('btn', styles.sideBtn)} aria-pressed={state.side === 0} aria-keyshortcuts="ArrowLeft A" onClick={() => choose(0)}>
                  {t.left}
                </button>
                <button type="button" className={cx('btn', styles.sideBtn)} aria-pressed={state.side === 1} aria-keyshortcuts="ArrowRight D" onClick={() => choose(1)}>
                  {t.right}
                </button>
              </div>
              <div className={styles.pad}>
                <button type="button" className="btn" aria-pressed={paused} aria-keyshortcuts="P" onClick={togglePause}>
                  {t.pause}
                </button>
                <button type="button" className="btn" aria-pressed={state.slow} onClick={() => send({ type: 'slow', on: !state.slow })}>
                  {t.slowLane}
                </button>
              </div>
              <p className={cx('muted', styles.keys)}>{t.keys}</p>
              <p className={cx('muted', styles.keys, styles.touchHelp)}>{t.touch}</p>
            </>
          )}
        </div>
      </div>
    </SystemWindow>
  );
}
