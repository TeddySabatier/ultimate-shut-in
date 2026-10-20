/**
 * Decision Dungeon Screen. State comes only from the engine through useEngine.
 * Every word comes from strings[locale]. Leave is a separate button from Step away.
 */
import { useEffect } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { getScenario } from './content';
import { currentRoom, engine, isOver, type DungeonState } from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

function lastReflection(state: DungeonState): string | null {
  const last = state.choices[state.choices.length - 1];
  if (!last) return null;
  return getScenario(state.locale, last.scenarioId)?.options[last.optionIndex]?.reflection ?? null;
}

export default function DecisionDungeonScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const over = isOver(state);
  const room = currentRoom(state);
  const scenario = room ? getScenario(state.locale, room.scenarioId) : undefined;
  const roomNumber = Math.min(state.roomIndex + 1, state.rooms.length);
  const last = lastReflection(state);
  const peeked =
    state.peekedDisplay >= 0 && scenario && room
      ? scenario.options[room.optionOrder[state.peekedDisplay]!]!.reflection
      : null;

  useEffect(() => {
    if (over || state.phase !== 'choose') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || !room || n > room.optionOrder.length) return;
      e.preventDefault();
      dispatch({ type: 'choose', index: n - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, state.phase, room, dispatch]);

  const endText = outcome ? s.end[outcome.result] : null;
  const tone = outcome?.result === 'won' ? 'success' : 'default';

  return (
    <SystemWindow
      className={cx(styles.dungeon, reducedMotion && styles.still)}
      title={game.manifest.name[locale]}
      headingLevel={2}
      tone={tone}
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
      <p className={styles.intro}>{s.intro}</p>

      <p className={styles.status} data-testid="decision-dungeon-room">
        <span className="mono">{formatText(s.room, { n: roomNumber, total: state.rooms.length })}</span>
      </p>

      {scenario && state.phase !== 'over' ? (
        <div key={state.roomIndex} className={styles.room}>
          <h3 className={styles.subtitle}>{s.situation}</h3>
          <p className={styles.situation} data-testid="decision-dungeon-situation">
            {scenario.situation}
          </p>
          {state.studyId ? (
            <p className={styles.reframe} data-testid="decision-dungeon-reframe">
              <span className={styles.reframeLabel}>{s.reframe}</span> {scenario.reframe}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.live} aria-live="polite">
        {(state.phase === 'reflect' || over) && last ? (
          <div className={styles.reflection} data-testid="decision-dungeon-reflection">
            <h3 className={styles.subtitle}>{s.reflection}</h3>
            <p>{last}</p>
          </div>
        ) : peeked ? (
          <div className={styles.reflection}>
            <h3 className={styles.subtitle}>{s.peeked}</h3>
            <p>{peeked}</p>
          </div>
        ) : null}
      </div>

      {endText ? (
        <p className={styles.banner} role="status" data-result={outcome?.result}>
          {endText}
        </p>
      ) : state.phase === 'choose' && scenario && room ? (
        <>
          <h3 className={styles.subtitle}>{s.doors}</h3>
          <ul className={styles.doors} data-testid="decision-dungeon-options">
            {room.optionOrder.map((orig, display) => {
              const option = scenario.options[orig]!;
              const revealed = state.revealed.includes(display);
              return (
                <li key={display} className={styles.door}>
                  <button
                    type="button"
                    className={cx('btn', styles.doorBtn)}
                    onClick={() => dispatch({ type: 'choose', index: display })}
                  >
                    <span className={styles.doorName}>{formatText(s.door, { n: display + 1 })}</span>
                    <span className={styles.doorLabel}>{option.label}</span>
                    {state.showCues ? (
                      <span className={styles.cue} data-testid="decision-dungeon-cue">
                        {formatText(s.cue, { cue: option.cue })}
                      </span>
                    ) : null}
                    {revealed ? (
                      <span className={styles.tag}>{formatText(s.tag, { style: s.styles[option.style] })}</span>
                    ) : null}
                  </button>
                  {state.sleepAvailable && !state.sleepUsed ? (
                    <button type="button" className={cx('btn', 'btn--ghost', styles.peek)} onClick={() => dispatch({ type: 'peek', index: display })}>
                      {formatText(s.peek, { n: display + 1 })}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className={styles.tools}>
            {state.hintsLeft > 0 ? (
              <button type="button" className="btn" onClick={() => dispatch({ type: 'hint' })}>
                {formatText(s.hint, { n: state.hintsLeft })}
              </button>
            ) : null}
          </div>
          <p className={cx('muted', styles.hint)}>
            {formatText(s.keys, { n: room.optionOrder.length })}
            {state.sleepAvailable && !state.sleepUsed ? ` ${s.sleepLeft}` : ''}
            {state.sleepUsed ? ` ${s.sleepUsed}` : ''}
          </p>
        </>
      ) : state.phase === 'reflect' ? (
        <div className={styles.tools}>
          {state.revivesLeft > 0 ? (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'undo' })}>
              {s.undo}
            </button>
          ) : null}
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'continue' })}>
            {s.continue}
          </button>
        </div>
      ) : null}
    </SystemWindow>
  );
}
