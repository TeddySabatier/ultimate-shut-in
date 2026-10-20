/**
 * Still Water's Screen. State comes only from the engine through useEngine.
 * Time is a 50 ms tick from useFixedStep; the ring is drawn between two
 * ticks with onFrame(alpha), straight into the DOM, so it moves smoothly
 * without re-rendering 60 times a second. Reduced motion swaps the ring for
 * a bar and keeps the same text cue. Every word is from strings[locale].
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { FIXED_DT_MS, formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { useFixedStep } from '../ui/useFixedStep';
import {
  breathAt,
  canChoosePace,
  displayCycle,
  engine,
  hintActive,
  nextPhase,
  phaseOf,
  phaseTicksLeft,
  steadiness,
  tapTarget,
  visibleDecoys,
  waterLevel,
  type Pace,
  type Phase,
} from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

/** A control the keys must keep for themselves: Space on a focused Pause button presses Pause. */
function keepsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-hold-button]')) return false;
  return target.isContentEditable || target.closest('button, a, input, select, textarea, summary, [role="button"]') !== null;
}

/** Seconds with one decimal for the rhythm lines ("4 s", "3.5 s", and "3,5 s" in French). */
function seconds(ticks: number, template: string, locale: 'en' | 'fr'): string {
  const n = String(Math.round((ticks * FIXED_DT_MS) / 100) / 10);
  return formatText(template, { n: locale === 'fr' ? n.replace('.', ',') : n });
}

const PACES: readonly { pace: Pace; key: 'paceBrisk' | 'paceSteady' | 'paceSlow' }[] = [
  { pace: -1, key: 'paceBrisk' },
  { pace: 0, key: 'paceSteady' },
  { pace: 1, key: 'paceSlow' },
];

export default function StillWaterScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [begun, setBegun] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tapMode, setTapMode] = useState(false);
  const [vibrate, setVibrate] = useState(false);
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const over = outcome !== null;
  const running = begun && !paused && !over;
  const phase = phaseOf(state);
  const decoy = visibleDecoys(state)[0];
  const lastCycle = state.cycleScores[state.cycleScores.length - 1];
  const water = waterLevel(state);

  const ringRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const live = useRef({ state, running, tapMode, phase, reducedMotion });
  useEffect(() => {
    live.current = { state, running, tapMode, phase, reducedMotion };
  });

  /** Draw the breath at `alpha` between two ticks: straight into the DOM, no re-render. */
  const paint = useCallback((alpha: number) => {
    const { state: st, reducedMotion: rm } = live.current;
    const breath = breathAt(st, rm ? 0 : alpha);
    if (ringRef.current) ringRef.current.style.setProperty('--breath', breath.toFixed(4));
    if (barRef.current) barRef.current.style.width = `${Math.round(breath * 100)}%`;
  }, []);
  useFixedStep(() => dispatch({ type: 'tick' }), { running, onFrame: paint });
  // Paint again on every state change, so a pause or the end shows the right frame.
  useEffect(() => paint(0), [state, paint]);

  // The pulse on a phase change: optional, off by default, only where the browser has it.
  const lastPhase = useRef<Phase>(phase);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    if (vibrate && running && canVibrate) navigator.vibrate(12);
  }, [phase, vibrate, running, canVibrate]);

  const setHold = useCallback(
    (down: boolean) => {
      if (!live.current.running) return;
      dispatch({ type: 'hold', down });
    },
    [dispatch],
  );
  /** Tap mode: one press says "this phase has started": hold on the breath in and the rest, off on the breath out. */
  const tapPhase = useCallback(() => {
    if (!live.current.running) return;
    dispatch({ type: 'hold', down: tapTarget(live.current.state) });
  }, [dispatch]);

  // Releasing: when the game pauses or ends, nothing stays held.
  useEffect(() => {
    if (!running) dispatch({ type: 'hold', down: false });
  }, [running, dispatch]);

  // Switching the tap mode on or off never leaves the breath held with nothing pressed.
  useEffect(() => {
    dispatch({ type: 'hold', down: false });
  }, [tapMode, dispatch]);

  // A hidden tab pauses the game (the clock already stops; this says so when the player comes back).
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && live.current.running) setPaused(true);
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  // When the game ends, the buttons it was driven by go away: the focus moves to the result.
  useEffect(() => {
    if (over) bannerRef.current?.focus({ preventScroll: true });
  }, [over]);

  // Keyboard: Space or Enter hold the breath unless a control has the key.
  useEffect(() => {
    const down = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.altKey || e.ctrlKey || e.metaKey || keepsKeys(e.target) || !live.current.running) return;
      e.preventDefault();
      if (e.repeat) return;
      down.add(e.key);
      if (live.current.tapMode) tapPhase();
      else setHold(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (!down.delete(e.key)) return;
      e.preventDefault();
      if (!live.current.tapMode) setHold(false);
    };
    // Focus lost with a key down: let go, so the breath never sticks.
    const release = () => {
      if (down.size === 0) return;
      down.clear();
      if (!live.current.tapMode) setHold(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [setHold, tapPhase]);

  /** The hold button takes the focus, so Space and Enter go straight to the breath (not back to the toggle just pressed). */
  const focusHold = () => requestAnimationFrame(() => holdRef.current?.focus({ preventScroll: true }));
  const begin = () => {
    setBegun(true);
    focusHold();
  };

  const cue = s.phase[phase];
  const phaseTicks = phase === 'inhale' ? state.inhaleTicks : phase === 'hold' ? state.holdTicks : phase === 'exhale' ? state.exhaleTicks : 0;
  // With a hint, the cue also tells a screen reader how long the phase lasts (spoken once per phase).
  const spokenLength = hintActive(state) && phaseTicks > 0 ? formatText(s.phaseLength, { n: seconds(phaseTicks, '{n}', locale) }) : null;
  const next = nextPhase(state);
  const left = Math.max(1, Math.ceil((phaseTicksLeft(state) * FIXED_DT_MS) / 1000));
  const nextLine = next ? formatText(s.next, { n: left, phase: s.phaseLower[next] }) : formatText(s.nextEnd, { n: left });
  const grace = seconds(state.tolerance, '{n}', locale);
  const endText = outcome ? s.end[outcome.result] : null;

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

      <div className={styles.layout}>
        <div className={styles.stage}>
          <p className={styles.status}>
            <span className="mono" data-testid="still-water-cycle">
              {formatText(s.cycle, { n: displayCycle(state), total: state.cycleCount })}
            </span>
            <span className="mono">{formatText(s.steady, { n: steadiness(state), total: state.decoys.length })}</span>
          </p>

          {reducedMotion ? (
            <div className={styles.barTrack} role="progressbar" aria-label={s.barLabel} aria-valuetext={cue} data-testid="still-water-bar">
              <div ref={barRef} className={styles.barFill} />
            </div>
          ) : (
            <div className={styles.pond} data-testid="still-water-pond" aria-hidden="true" style={{ '--water': `${water}%` } as CSSProperties}>
              <div className={styles.waterFill} />
              <div ref={ringRef} className={cx(styles.ring, state.holding && styles.ringHeld)} />
            </div>
          )}

          <p className={styles.cue} aria-live="polite" data-testid="still-water-phase">
            {paused && !over ? s.paused : cue}
            {spokenLength && !paused && !over ? <span className="srOnly">, {spokenLength}</span> : null}
          </p>
          {state.hintCycles > 0 ? (
            <p className={cx('muted', styles.next)} data-testid="still-water-next" aria-hidden="true">
              {hintActive(state) ? nextLine : '\u00a0'}
            </p>
          ) : null}

        </div>

        <div className={styles.controls}>
          {!begun && !over ? (
            <div className={styles.ready} data-testid="still-water-ready">
              <p className={styles.intro}>{s.intro}</p>
              <p className={cx('mono', styles.rhythm)} data-testid="still-water-rhythm">
                {formatText(s.rhythm, {
                  in: seconds(state.inhaleTicks, s.seconds, locale),
                  hold: seconds(state.holdTicks, s.seconds, locale),
                  out: seconds(state.exhaleTicks, s.seconds, locale),
                })}
              </p>
              <p className={cx('muted', styles.line)}>{s.keys}</p>
              <p className={cx('muted', styles.line)}>{formatText(s.grace, { n: grace })}</p>
              {state.sleepName ? <p className={cx('muted', styles.line)}>{formatText(s.sleepPerk, { name: state.sleepName })}</p> : null}
              {state.eatName ? <p className={cx('muted', styles.line)}>{formatText(s.eatPerk, { name: state.eatName })}</p> : null}
              {!state.eatName && state.hintCycles > 0 ? <p className={cx('muted', styles.line)}>{state.hintCycles === 1 ? s.hintPerkOne : formatText(s.hintPerk, { n: state.hintCycles })}</p> : null}
              {state.moveName ? <p className={cx('muted', styles.line)}>{formatText(s.movePerk, { name: state.moveName })}</p> : null}
              {canChoosePace(state) ? (
                <div role="group" aria-label={s.paceGroup} className={styles.paces}>
                  {PACES.map(({ pace, key }) => (
                    <button key={pace} type="button" className="btn" aria-pressed={state.pace === pace} onClick={() => dispatch({ type: 'pace', pace })}>
                      {s[key]}
                    </button>
                  ))}
                </div>
              ) : null}
              <button type="button" className={cx('btn btn--primary', styles.begin)} data-testid="still-water-begin" onClick={begin}>
                {s.begin}
              </button>
            </div>
          ) : null}

          {begun && !over ? (
            <button
              ref={holdRef}
              type="button"
              className={cx('btn btn--primary', styles.hold)}
              data-testid="still-water-hold"
              data-hold-button=""
              aria-pressed={state.holding}
              onPointerDown={(e) => {
                e.preventDefault();
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* no active pointer to capture (a synthetic event): the release handlers still run */
                }
                if (tapMode) tapPhase();
                else setHold(true);
              }}
              onPointerUp={() => {
                if (!tapMode) setHold(false);
              }}
              onPointerCancel={() => {
                if (!tapMode) setHold(false);
              }}
              onLostPointerCapture={() => {
                if (!tapMode) setHold(false);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span>{tapMode ? s.holdTap : s.hold}</span>
              <span className={styles.holdState} aria-hidden="true">
                {state.holding ? s.holdOn : s.holdOff}
              </span>
            </button>
          ) : null}

          {begun && !over ? (
            <div className={styles.ripples} data-testid="still-water-ripples">
              {decoy ? (
                <button type="button" className={cx('btn btn--ghost', styles.decoy)} onClick={() => dispatch({ type: 'tap', decoyId: decoy.id })}>
                  {s.decoy[decoy.kind]}
                </button>
              ) : (
                <p className={cx('muted', styles.line)}>{s.rippleIdle}</p>
              )}
            </div>
          ) : null}

          {begun || over ? (
            <>
              <div className={styles.water} aria-hidden="true">
                <div className={styles.waterTrack}>
                  <div className={styles.waterBar} style={{ width: `${water}%` }} />
                </div>
                <span className="mono">{formatText(s.water, { level: water })}</span>
              </div>
              <p className={cx('muted', styles.report)} aria-live="polite" data-testid="still-water-report">
                {lastCycle && !over ? formatText(s.cycleReport, { n: lastCycle.index + 1, accuracy: lastCycle.accuracy }) : '\u00a0'}
              </p>
            </>
          ) : null}

          {begun && !over ? (
            <>
              {tapMode ? <p className={cx('muted', styles.line)}>{s.tapHint}</p> : null}
              <div role="group" aria-label={s.options} className={styles.options}>
                <button type="button" className="btn" aria-pressed={paused} onClick={() => {
                    if (paused) focusHold();
                    setPaused((p) => !p);
                  }}>
                  {paused ? s.resume : s.pause}
                </button>
                <button type="button" className="btn" aria-pressed={tapMode} onClick={() => {
                    focusHold();
                    setTapMode((v) => !v);
                  }}>
                  {s.tapMode}
                </button>
                {canVibrate ? (
                  <button type="button" className="btn" aria-pressed={vibrate} onClick={() => {
                      focusHold();
                      setVibrate((v) => !v);
                    }}>
                    {s.vibrate}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          <div ref={bannerRef} tabIndex={-1} className={styles.banner} role="status" data-result={outcome?.result ?? ''} data-testid="still-water-banner">
            {endText ? (
              <>
                <p className={styles.bannerTitle}>{endText}</p>
                <p className={styles.bannerLine}>
                  {formatText(s.summary, {
                    accuracy: String(outcome?.stats?.['accuracy'] ?? 0),
                    n: String(outcome?.stats?.['steadiness'] ?? 0),
                    total: String(outcome?.stats?.['ripples'] ?? 0),
                  })}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </SystemWindow>
  );
}
