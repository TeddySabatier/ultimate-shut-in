/**
 * Still Water's Screen. State comes only from the engine through useEngine.
 * Time is a tick from useFixedStep. Reduced motion replaces the ring with a
 * bar and the same text cue. Every word is from strings[locale].
 */
import { useEffect, useRef, useState } from 'react';
import { Meter } from '../../components/Meter';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { FIXED_DT_MS, formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  breathProgress,
  displayCycle,
  engine,
  isOver,
  phaseOf,
  visibleDecoys,
  waterLevel,
  type DecoyKind,
  type Phase,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function secondsLabel(ticks: number, template: string): string {
  return formatText(template, { n: Math.round((ticks * FIXED_DT_MS) / 100) / 10 });
}

function decoyLabel(kind: DecoyKind, locale: 'en' | 'fr'): string {
  return strings[locale].decoy[kind];
}

export default function StillWaterScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [paused, setPaused] = useState(false);
  const [tapMode, setTapMode] = useState(false);
  const [vibrate, setVibrate] = useState(false);
  const over = isOver(state);
  const running = outcome === null && !paused;
  const phase: Phase = phaseOf(state);
  const water = waterLevel(state);
  const breath = breathProgress(state);
  const decoys = visibleDecoys(state);
  const lastPhase = useRef<Phase>(phase);
  const live = useRef({ over, paused, tapMode, phase, dispatch });
  useEffect(() => {
    live.current = { over, paused, tapMode, phase, dispatch };
  });

  useFixedStep(() => dispatch({ type: 'tick' }), { running });

  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    if (!vibrate || over || paused) return;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') nav.vibrate(12);
  }, [phase, vibrate, over, paused]);

  const setHold = (down: boolean) => {
    if (live.current.over || live.current.paused) return;
    live.current.dispatch({ type: 'hold', down });
  };

  const onPhaseTap = () => {
    if (live.current.over || live.current.paused) return;
    setHold(live.current.phase !== 'exhale');
  };

  useEffect(() => {
    const downKeys = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if (live.current.over) return;
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      downKeys.add(e.key);
      if (live.current.tapMode) {
        if (live.current.over || live.current.paused) return;
        live.current.dispatch({ type: 'hold', down: live.current.phase !== 'exhale' });
      } else {
        setHold(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (!downKeys.has(e.key)) return;
      downKeys.delete(e.key);
      e.preventDefault();
      if (!live.current.tapMode && !live.current.over && !live.current.paused) {
        live.current.dispatch({ type: 'hold', down: false });
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const cue = s.phase[phase];
  const pondLabel = formatText(s.pondLabel, { phase: cue, level: water });
  const endText = outcome ? s.end[outcome.result] : null;
  const ringScale = 35 + Math.round((breath * 55) / 100);

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
              {s.forfeit}
            </button>
          )}
          <button type="button" className="btn" onClick={exit}>
            {s.leave}
          </button>
        </>
      }
    >
      <p className={styles.disclaimer} data-testid="still-water-disclaimer">
        {s.disclaimer}
      </p>
      <p className={styles.intro}>{s.intro}</p>

      <p className={styles.status}>
        <span className="mono" data-testid="still-water-cycle">
          {formatText(s.cycle, { n: displayCycle(state), total: state.cycleCount })}
        </span>
        <span className="mono" data-testid="still-water-rhythm">
          {formatText(s.rhythm, {
            in: secondsLabel(state.inhaleTicks, s.seconds),
            hold: secondsLabel(state.holdTicks, s.seconds),
            out: secondsLabel(state.exhaleTicks, s.seconds),
          })}
        </span>
      </p>

      <div className={styles.stage}>
        {reducedMotion ? (
          <div className={styles.barWrap}>
            <Meter value={breath} max={100} label={cue} tone="bright" text={cue} size="lg" />
          </div>
        ) : (
          <div className={styles.pond} data-testid="still-water-pond" role="img" aria-label={pondLabel}>
            <div className={styles.waterFill} style={{ height: `${water}%` }} />
            <div className={cx(styles.ring, state.holding && styles.ringHeld)} style={{ transform: `scale(${ringScale / 100})` }} />
            {state.showHint ? <div className={styles.hintRing} aria-hidden="true" /> : null}
          </div>
        )}

        <p className={styles.cue} aria-live="polite" data-testid="still-water-phase">
          {paused ? s.paused : cue}
        </p>

        <Meter
          value={water}
          max={100}
          label={s.waterLabel}
          tone="bright"
          text={formatText(s.water, { level: water })}
          size="md"
        />
      </div>

      {state.showHint ? <p className={cx('muted', styles.hint)}>{s.hintLine}</p> : null}
      {state.sleepName ? <p className={cx('muted', styles.hint)}>{formatText(s.sleepPerk, { name: state.sleepName })}</p> : null}
      {state.eatName ? <p className={cx('muted', styles.hint)}>{formatText(s.eatPerk, { name: state.eatName })}</p> : null}
      {state.moveName ? <p className={cx('muted', styles.hint)}>{formatText(s.movePerk, { name: state.moveName })}</p> : null}

      {decoys.length > 0 ? (
        <div className={styles.ripples}>
          <p className={cx('muted', styles.hint)}>{s.decoyHint}</p>
          <ul className={styles.decoyList}>
            {decoys.map((d) => (
              <li key={d.id}>
                <button type="button" className={cx('btn btn--ghost', styles.decoy)} onClick={() => dispatch({ type: 'tap', decoyId: d.id })}>
                  {decoyLabel(d.kind, locale)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {endText ? (
        <p className={styles.banner} role="status" data-result={outcome?.result}>
          {endText}
        </p>
      ) : (
        <>
          <button
            type="button"
            className={cx('btn btn--primary', styles.hold)}
            data-testid="still-water-hold"
            aria-pressed={state.holding}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              if (tapMode) onPhaseTap();
              else setHold(true);
            }}
            onPointerUp={(e) => {
              if (tapMode) return;
              setHold(false);
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              if (!tapMode) setHold(false);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {state.holding ? s.holding : tapMode ? s.tapPhase : s.hold}
          </button>

          <div className={styles.toggles}>
            <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? s.resume : s.pause}
            </button>
            <button type="button" className="btn" aria-pressed={tapMode} onClick={() => setTapMode((v) => !v)}>
              {s.tapPhase}
            </button>
            <button type="button" className="btn" aria-pressed={vibrate} onClick={() => setVibrate((v) => !v)}>
              {s.vibrate}
            </button>
          </div>
          <p className={cx('muted', styles.hint)}>{tapMode ? s.tapPhaseHint : s.keys}</p>
        </>
      )}
    </SystemWindow>
  );
}
