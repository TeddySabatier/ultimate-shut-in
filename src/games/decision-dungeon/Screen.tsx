/**
 * Decision Dungeon Screen. State comes only from the engine, through useEngine;
 * every word comes from strings[locale] (the UI) or texts-*.ts (the scenes).
 * Step away dispatches the engine's own leave action (the run ends as `fled`
 * and the board stays); Leave is a separate button that calls exit().
 */
import { useEffect, useRef, useState } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { currentRoom, engine, goodCount, isOver, styleAt, styleCounts } from './engine';
import game from './manifest';
import { strings } from './strings';
import { getText } from './texts';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

export default function DecisionDungeonScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const [sleeping, setSleeping] = useState(false);
  const over = isOver(state);
  const room = currentRoom(state);
  const text = room ? getText(locale, room.scenarioId) : undefined;
  const total = state.rooms.length;
  const roomNumber = Math.min(state.roomIndex + 1, total);
  const choosing = state.phase === 'choose' && !over;
  const last = state.choices[state.choices.length - 1];
  const lastText = last ? getText(locale, last.scenarioId)?.options[last.optionIndex] : undefined;
  const peeked = state.peekedDisplay >= 0 && room && text ? text.options[room.optionOrder[state.peekedDisplay]!] : undefined;

  const situationRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const doorsRef = useRef<HTMLUListElement>(null);
  const mounted = useRef(false);
  const mountedTools = useRef(false);

  // Keep focus where the player is: the next button after a choice, the new room after "Next room".
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (state.phase === 'reflect') nextRef.current?.focus();
    else if (state.phase === 'choose') situationRef.current?.focus();
  }, [state.phase, state.roomIndex]);

  // The end of the run: the control that was focused is gone, so the result line takes the focus.
  useEffect(() => {
    if (over) bannerRef.current?.focus();
  }, [over]);

  // A tool button (a hint, Sleep on it) unmounts when it is used up or after a preview: if that was the focused
  // control, hand the focus to the first door instead of letting it fall to the page.
  const hiddenDoors = room ? room.optionOrder.length - state.revealed.length : 0;
  useEffect(() => {
    if (!mountedTools.current) {
      mountedTools.current = true;
      return;
    }
    if (choosing && (document.activeElement === document.body || document.activeElement === null)) doorsRef.current?.querySelector('button')?.focus();
  }, [state.hintsLeft, state.sleepsLeft, state.peekedDisplay, hiddenDoors, sleeping, choosing]);

  // Number keys choose a door (or preview it while sleeping on it). Ignored while a field has focus.
  useEffect(() => {
    if (!choosing || !room) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > room.optionOrder.length) return;
      e.preventDefault();
      if (sleeping) {
        dispatch({ type: 'peek', index: n - 1 });
        setSleeping(false);
      } else dispatch({ type: 'choose', index: n - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choosing, room, sleeping, dispatch]);

  const pressDoor = (display: number) => {
    if (sleeping) {
      dispatch({ type: 'peek', index: display });
      setSleeping(false);
    } else dispatch({ type: 'choose', index: display });
  };

  const isLast = state.roomIndex >= total - 1;
  const strongest = typeof outcome?.stats?.strongest === 'string' ? (outcome.stats.strongest as keyof typeof s.styles) : null;

  return (
    <SystemWindow
      className={cx(styles.dungeon, reducedMotion && styles.still)}
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
      <p className={styles.disclaimer}>{s.disclaimer}</p>
      {state.roomIndex === 0 && choosing ? <p className={styles.intro}>{s.intro}</p> : null}

      <p className={styles.status} data-testid="decision-dungeon-room">
        <span className="mono">{formatText(s.room, { n: roomNumber, total })}</span>
      </p>

      {text && state.phase !== 'over' ? (
        <div key={state.roomIndex} ref={situationRef} tabIndex={-1} className={styles.room}>
          <h3 className={styles.subtitle}>{s.situation}</h3>
          <p className={styles.situation} data-testid="decision-dungeon-situation">
            {text.situation}
          </p>
          {state.studyId ? (
            <p className={styles.reframe} data-testid="decision-dungeon-reframe">
              <span className={styles.reframeLabel}>{s.reframe}</span> {text.reframe}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.live} aria-live="polite" aria-atomic="true">
        {(state.phase === 'reflect' || over) && lastText ? (
          <div className={styles.reflection} data-testid="decision-dungeon-reflection">
            <h3 className={styles.subtitle}>{s.reflection}</h3>
            <p className={styles.chose}>{formatText(s.youChose, { n: (last?.displayIndex ?? 0) + 1, label: lastText.label })}</p>
            <p>{lastText.reflection}</p>
          </div>
        ) : choosing && peeked ? (
          <div className={styles.reflection} data-testid="decision-dungeon-peek">
            <h3 className={styles.subtitle}>{formatText(s.peeked, { n: state.peekedDisplay + 1 })}</h3>
            <p>{peeked.reflection}</p>
          </div>
        ) : null}
      </div>

      {outcome ? (
        <>
          <p ref={bannerRef} tabIndex={-1} className={styles.banner} role="status" data-result={outcome.result}>
            {s.end[outcome.result]}
          </p>
          {state.choices.length > 0 && strongest ? (
            <div className={styles.result} data-testid="decision-dungeon-result">
              <h3 className={styles.subtitle}>{s.resultTitle}</h3>
              <ul className={styles.resultList}>
                <li>{formatText(s.resultScore, { good: goodCount(state.choices), total: state.choices.length })}</li>
                <li>{formatText(s.resultStrongest, { style: s.styles[strongest] })}</li>
                {styleCounts(state.choices).curious > 0 ? <li>{formatText(s.resultCurious, { n: styleCounts(state.choices).curious })}</li> : null}
                <li>{formatText(s.resultTip, { tip: outcome.learned?.note[locale] ?? '' })}</li>
              </ul>
            </div>
          ) : null}
        </>
      ) : choosing && text && room ? (
        <>
          <h3 className={styles.subtitle}>{s.doors}</h3>
          <ul ref={doorsRef} className={styles.doors} data-testid="decision-dungeon-options">
            {room.optionOrder.map((source, display) => {
              const option = text.options[source]!;
              const revealed = state.revealed.includes(display);
              return (
                <li key={display} className={styles.door}>
                  <button
                    type="button"
                    className={cx('btn', styles.doorBtn, sleeping && styles.sleepDoor)}
                    aria-keyshortcuts={String(display + 1)}
                    onClick={() => pressDoor(display)}
                  >
                    <span className={styles.doorName}>{formatText(sleeping ? s.previewDoor : s.door, { n: display + 1 })}</span>
                    <span className={styles.doorLabel}>{option.label}</span>
                    {state.showCues ? (
                      <span className={styles.cue} data-testid="decision-dungeon-cue">
                        {formatText(s.cue, { cue: option.cue })}
                      </span>
                    ) : null}
                    {revealed ? (
                      <span className={styles.tag} data-testid="decision-dungeon-tag">
                        {formatText(s.tag, { style: s.styles[styleAt(state, display) ?? 'constructive'] })}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={styles.tools}>
            {state.sleepsLeft > 0 && state.peekedDisplay < 0 ? (
              <button type="button" className="btn" aria-pressed={sleeping} onClick={() => setSleeping((v) => !v)}>
                {formatText(s.sleepToggle, { n: state.sleepsLeft })}
              </button>
            ) : null}
            {state.hintsLeft > 0 && hiddenDoors > 0 ? (
              <button type="button" className="btn" onClick={() => dispatch({ type: 'hint' })}>
                {formatText(s.hint, { n: state.hintsLeft })}
              </button>
            ) : null}
          </div>
          {sleeping ? <p className={styles.hint}>{s.sleepHelp}</p> : null}
          <p className={cx('muted', styles.hint)}>{formatText(sleeping ? s.keysSleep : s.keys, { n: room.optionOrder.length })}</p>
        </>
      ) : state.phase === 'reflect' ? (
        <div className={styles.tools}>
          {state.revivesLeft > 0 ? (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'undo' })}>
              {formatText(s.undo, { n: state.revivesLeft })}
            </button>
          ) : null}
          <button ref={nextRef} type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'continue' })}>
            {isLast ? s.finish : s.continue}
          </button>
        </div>
      ) : null}
    </SystemWindow>
  );
}
