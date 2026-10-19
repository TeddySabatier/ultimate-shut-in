/**
 * Coin Duel's Screen: the reference for every game's UI.
 *
 * The rules every Screen follows:
 * - Default export, props are `GameScreenProps`, nothing else. No store, no
 *   router, no storage, no network. Shared presentational components from
 *   `src/components` are welcome.
 * - State comes only from the engine, through `useEngine` (which also calls
 *   `onFinish` exactly once, with the log in the player's language).
 * - Playable by touch (buttons of at least 44px) and keyboard (every control
 *   is a button; shortcuts are a bonus, never the only way).
 * - `reducedMotion` turns animation off; the layout stays the same.
 * - Every word comes from `strings[locale]`.
 */
import { useEffect } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { FATIGUE, ROUNDS, chanceFor, effectivePower, engine, isOver, outcomeLog, tally } from './engine';
import game from './manifest';
import { strings } from './strings';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

export default function CoinDuelScreen(props: GameScreenProps) {
  const { locale, reducedMotion, onExit } = props;
  const s = strings[locale];
  const { state, dispatch, outcome } = useEngine(engine, props, {
    localize: (o, st) => ({ ...o, log: outcomeLog(st, strings[locale]) }),
  });
  const { wins, losses } = tally(state);
  const over = isOver(state);
  const last = state.flips[state.flips.length - 1];
  const round = over ? state.flips.length : Math.min(state.flips.length + 1, ROUNDS);

  // Keyboard shortcuts: 1..9 send the n-th ally. Ignored while typing in a field (the Lab has a seed input).
  useEffect(() => {
    if (over) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const n = Number(e.key);
      const d = Number.isInteger(n) && n >= 1 ? state.duelists[n - 1] : undefined;
      if (!d) return;
      e.preventDefault();
      dispatch({ type: 'send', memberId: d.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, state.duelists, dispatch]);

  const endText = outcome ? s.end[outcome.result] : null;

  return (
    <SystemWindow
      className={cx(styles.duel, reducedMotion && styles.still)}
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
          <button type="button" className="btn" onClick={onExit}>
            {s.leave}
          </button>
        </>
      }
    >
      <p className={styles.intro}>{s.intro}</p>

      <p className={styles.status}>
        <span className="mono">{formatText(s.round, { n: round, total: ROUNDS })}</span>
        <span className="mono" data-testid="coin-duel-score">
          {formatText(s.score, { wins, losses })}
        </span>
      </p>

      <h3 className={styles.subtitle}>{s.rivalTitle}</h3>
      <ol className={styles.rivals}>
        {state.rivals.map((power, i) => {
          const flip = state.flips[i];
          const status = flip ? (flip.won ? 'won' : 'lost') : i === state.flips.length && !over ? 'current' : 'next';
          return (
            <li key={i} className={styles.rival} data-status={status}>
              <span className={styles.rivalRound}>{formatText(s.rivalRound, { n: i + 1 })}</span>
              <span className="mono">{formatText(s.rivalPower, { power })}</span>
            </li>
          );
        })}
      </ol>

      <div className={styles.flip} aria-live="polite">
        <span key={state.flips.length} className={cx(styles.coin, last && styles.spin, last && (last.won ? styles.heads : styles.tails))} aria-hidden="true">
          {last ? (last.won ? s.coin.heads : s.coin.tails).charAt(0) : '?'}
        </span>
        <p className={styles.flipText}>{last ? formatText(last.won ? s.flip.won : s.flip.lost, { name: last.name, roll: last.roll, chance: last.chance }) : s.coin.idle}</p>
      </div>

      {endText ? (
        <p className={styles.banner} role="status" data-result={outcome?.result}>
          {endText}
        </p>
      ) : (
        <>
          <h3 className={styles.subtitle}>{s.allies}</h3>
          <ul className={styles.allies}>
            {state.duelists.map((d) => (
              <li key={d.id}>
                <button type="button" className={cx('btn', styles.ally)} onClick={() => dispatch({ type: 'send', memberId: d.id })}>
                  <span className={styles.allyName}>{formatText(s.send, { name: d.name })}</span>
                  <span className={styles.allyOdds}>{formatText(s.odds, { power: effectivePower(d), chance: chanceFor(state, d) })}</span>
                  {d.uses > 0 ? <span className={styles.allyTired}>{formatText(s.tired, { fatigue: FATIGUE * d.uses })}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <p className={cx('muted', styles.hint)}>
            {formatText(s.keys, { n: Math.min(9, state.duelists.length) })}
            {state.edge > 0 ? ` ${formatText(s.edge, { edge: state.edge })}` : ''}
            {state.revivesLeft > 0 ? ` ${formatText(s.revives, { n: state.revivesLeft })}` : ''}
          </p>
        </>
      )}
    </SystemWindow>
  );
}
