/**
 * Haven Rush Screen: real-time lane, 50 ms ticks, canvas interpolation.
 *
 * State comes only from the engine through useEngine. Leave and Forfeit are
 * separate buttons. Pause is local (the clock stops; the state does not change).
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Meter } from '../../components/Meter';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useCanvas, type CanvasSize } from '../ui/useCanvas';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  CENTER,
  LANE_W,
  MAX_DRAW,
  countApplied,
  engine,
  formatOp,
  isOver,
  nextGate,
  studyPreview,
  type GateRunnerState,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function worldX(x: number, width: number): number {
  return 8 + (x / LANE_W) * (width - 16);
}

function worldY(wy: number, squadY: number, height: number): number {
  const scale = height / 280;
  return height * 0.78 - (wy - squadY) * scale;
}

function drawWorld(
  canvas: HTMLCanvasElement | null,
  size: CanvasSize,
  prev: GateRunnerState,
  cur: GateRunnerState,
  alpha: number,
  hintSide: 0 | 1 | null,
  reducedMotion: boolean,
): void {
  const ctx = canvas?.getContext('2d');
  if (!ctx || size.width === 0) return;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  const w = size.width;
  const h = size.height;
  const a = reducedMotion ? 1 : alpha;
  const x = lerp(prev.x, cur.x, a);
  const y = lerp(prev.y, cur.y, a);
  const bossY = lerp(prev.bossY, cur.bossY, a);

  ctx.fillStyle = token('--color-bg', '#0f0f14');
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = token('--color-panel', '#1a1a24');
  ctx.fillRect(worldX(0, w), 0, worldX(LANE_W, w) - worldX(0, w), h);
  ctx.fillStyle = token('--color-panel-raised', '#22222f');
  ctx.fillRect(worldX(0, w), 0, worldX(CENTER, w) - worldX(0, w), h);

  ctx.strokeStyle = token('--color-accent-2', '#ffb84d');
  ctx.lineWidth = 2;
  ctx.setLineDash(reducedMotion ? [] : [6, 8]);
  ctx.beginPath();
  ctx.moveTo(worldX(CENTER, w), 0);
  ctx.lineTo(worldX(CENTER, w), h);
  ctx.stroke();
  ctx.setLineDash([]);

  const text = token('--color-text', '#e8e8f0');
  const danger = token('--color-danger', '#ff6b85');
  const accent = token('--color-accent', '#7c5cff');
  const info = token('--color-info', '#7cc6ff');
  const success = token('--color-success', '#4dff9a');
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const g of cur.gates) {
    const gy = worldY(g.y, y, h);
    if (gy < -20 || gy > h + 20) continue;
    const leftX = worldX(24, w);
    const rightX = worldX(176, w);
    const gw = Math.max(36, (worldX(CENTER, w) - worldX(0, w)) * 0.72);
    ctx.fillStyle = g.applied ? token('--color-border', '#2c2c3c') : accent;
    ctx.fillRect(leftX - gw / 2, gy - 14, gw, 28);
    ctx.fillRect(rightX - gw / 2, gy - 14, gw, 28);
    ctx.fillStyle = text;
    ctx.fillText(formatOp(g.left), leftX, gy);
    ctx.fillText(formatOp(g.right), rightX, gy);
    if (hintSide !== null && !g.applied && g === nextGate(cur)) {
      ctx.fillStyle = success;
      const hx = hintSide === 0 ? leftX : rightX;
      ctx.beginPath();
      ctx.moveTo(hx, gy + 22);
      ctx.lineTo(hx - 8, gy + 34);
      ctx.lineTo(hx + 8, gy + 34);
      ctx.closePath();
      ctx.fill();
    }
  }

  for (const e of cur.enemies) {
    const ey = worldY(e.y, y, h);
    if (ey < -16 || ey > h + 16) continue;
    const ex = worldX(e.lane === 2 ? CENTER : e.lane === 0 ? 50 : 150, w);
    ctx.fillStyle = e.kind === 'wall' ? info : danger;
    const rw = e.kind === 'wall' ? 52 : 28;
    ctx.fillRect(ex - rw / 2, ey - 12, rw, 24);
    ctx.fillStyle = token('--color-bg', '#0f0f14');
    ctx.fillText(String(e.hp), ex, ey);
  }

  for (const p of cur.pickups) {
    if (p.taken) continue;
    const py = worldY(p.y, y, h);
    if (py < -12 || py > h + 12) continue;
    const px = worldX(p.lane === 2 ? CENTER : p.lane === 0 ? 50 : 150, w);
    ctx.fillStyle = success;
    ctx.fillRect(px - 10, py - 10, 20, 20);
    ctx.fillStyle = token('--color-bg', '#0f0f14');
    ctx.fillText(p.kind === 'members' ? `+${p.n}` : 'F', px, py);
  }

  if (cur.phase === 'boss' || cur.bossY > y) {
    const by = worldY(bossY, y, h);
    ctx.fillStyle = accent;
    ctx.fillRect(worldX(20, w), by - 18, worldX(180, w) - worldX(20, w), 36);
    ctx.fillStyle = text;
    ctx.fillText(String(cur.bossHp), worldX(CENTER, w), by);
  }

  const sx = worldX(x, w);
  const sy = worldY(y, y, h);
  const drawn = cur.squad < MAX_DRAW ? cur.squad : MAX_DRAW;
  const spark = token('--color-accent-2', '#ffb84d');
  for (let i = 0; i < drawn; i++) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    ctx.fillStyle = spark;
    ctx.fillRect(sx - 16 + col * 5, sy - 6 + row * 5, 4, 4);
  }
  ctx.fillStyle = text;
  ctx.font = '16px ui-monospace, monospace';
  ctx.fillText(String(cur.squad), sx, sy - 22);
  if (cur.flashTicks > 0) {
    ctx.fillStyle = cur.flash >= 0 ? success : danger;
    ctx.fillText(cur.flash >= 0 ? `+${cur.flash}` : String(cur.flash), sx + 28, sy - 22);
  }
}

export default function HavenRushScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const t = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [paused, setPaused] = useState(false);
  const { ref, size } = useCanvas();
  const prev = useRef(state);
  const cur = useRef(state);
  const keys = useRef({ left: false, right: false });
  useEffect(() => {
    prev.current = cur.current;
    cur.current = state;
  }, [state]);

  const over = isOver(state);
  const running = outcome === null && !paused;
  const g = nextGate(state);
  const planned = g ? state.bestPath[countApplied(state)] : undefined;
  const hintSide: 0 | 1 | null = state.hintLeft > 0 && (planned === 0 || planned === 1) ? planned : null;
  const preview = studyPreview(state);

  const onFrame = useCallback(
    (alpha: number) => drawWorld(ref.current, size, prev.current, cur.current, reducedMotion ? 1 : alpha, hintSide, reducedMotion),
    [ref, size, reducedMotion, hintSide],
  );
  useFixedStep(() => dispatch({ type: 'tick' }), { running, onFrame });
  useEffect(() => drawWorld(ref.current, size, state, state, 1, hintSide, reducedMotion), [ref, size, state, hintSide, reducedMotion]);

  const applySteer = useCallback(() => {
    const dir: -1 | 0 | 1 = keys.current.left && !keys.current.right ? -1 : keys.current.right && !keys.current.left ? 1 : 0;
    dispatch({ type: 'steer', dir });
  }, [dispatch]);

  useEffect(() => {
    if (over) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        keys.current.left = true;
        applySteer();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        keys.current.right = true;
        applySteer();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.current.left = false;
        applySteer();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.current.right = false;
        applySteer();
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [over, applySteer]);

  const onCanvasPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    if (over) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const left = e.clientX - rect.left < rect.width / 2;
    keys.current.left = e.type !== 'pointerup' && e.type !== 'pointercancel' && left;
    keys.current.right = e.type !== 'pointerup' && e.type !== 'pointercancel' && !left;
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    applySteer();
  };

  const hold = (dir: -1 | 1, down: boolean) => {
    if (dir < 0) keys.current.left = down;
    else keys.current.right = down;
    applySteer();
  };

  const endText = outcome ? t.end[outcome.result] : null;
  const canvasLabel = formatText(t.canvasLabel, {
    n: state.squad,
    left: g ? formatOp(g.left) : '—',
    right: g ? formatOp(g.right) : '—',
    hp: state.bossHp,
  });

  return (
    <SystemWindow
      className={styles.wrap}
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
      <p className={styles.intro}>{t.intro}</p>

      <div className={styles.layout}>
        <div className={styles.stage}>
          <canvas
            ref={ref}
            className={styles.canvas}
            role="img"
            aria-label={canvasLabel}
            data-testid="gate-runner-canvas"
            onPointerDown={onCanvasPointer}
            onPointerMove={(e) => {
              if (e.buttons) onCanvasPointer(e);
            }}
            onPointerUp={onCanvasPointer}
            onPointerCancel={onCanvasPointer}
          />
        </div>

        <div>
          <div className={styles.hud}>
            <p className={styles.stat} data-testid="gate-runner-squad">
              {formatText(t.squad, { n: state.squad })}
            </p>
            <p className={styles.stat} data-testid="gate-runner-boss">
              {formatText(t.boss, { hp: state.bossHp, max: state.bossMaxHp })}
            </p>
            <p className={styles.live} aria-live="polite">
              {g ? formatText(t.nextGate, { left: formatOp(g.left), right: formatOp(g.right) }) : formatText(t.boss, { hp: state.bossHp, max: state.bossMaxHp })}
            </p>
          </div>
          <Meter label={t.boss.replace(' {hp} / {max}', '')} value={state.bossHp} max={state.bossMaxHp || 1} tone="attack" size="sm" />

          <div className={styles.flags}>
            {state.shield > 0 ? <p className={styles.flag}>{formatText(t.shield, { n: state.shield })}</p> : null}
            {state.reviveOn ? <p className={styles.flag}>{t.reviveReady}</p> : null}
            {state.fireRateTicks > 0 ? <p className={styles.flag}>{t.fireRate}</p> : null}
            {hintSide !== null ? <p className={styles.flag}>{formatText(t.hint, { side: hintSide === 0 ? t.left : t.right })}</p> : null}
          </div>

          {preview.length > 0 ? (
            <div className={styles.study}>
              <h3>{t.studyTitle}</h3>
              <ul className={styles.studyList}>
                {preview.map((p, i) => (
                  <li key={i}>{formatText(t.studyPair, p)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {endText ? (
            <p className={styles.banner} role="status" data-result={outcome?.result}>
              {endText}
            </p>
          ) : (
            <div className={styles.controls}>
              <button
                type="button"
                className="btn"
                aria-keyshortcuts="ArrowLeft A"
                onPointerDown={() => hold(-1, true)}
                onPointerUp={() => hold(-1, false)}
                onPointerCancel={() => hold(-1, false)}
              >
                {t.left}
              </button>
              <button
                type="button"
                className="btn"
                aria-keyshortcuts="ArrowRight D"
                onPointerDown={() => hold(1, true)}
                onPointerUp={() => hold(1, false)}
                onPointerCancel={() => hold(1, false)}
              >
                {t.right}
              </button>
              <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
                {paused ? t.resume : t.pause}
              </button>
              <button type="button" className="btn" aria-pressed={state.slowLane} onClick={() => dispatch({ type: 'slow', on: !state.slowLane })}>
                {t.slowLane}
              </button>
            </div>
          )}
          {over ? null : <p className={cx('muted', styles.hint)}>{t.keys}</p>}
        </div>
      </div>
    </SystemWindow>
  );
}
