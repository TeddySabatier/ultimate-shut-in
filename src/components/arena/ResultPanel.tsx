/**
 * After a game: what happened, what it paid, what was learned, and the way on
 * (docs/design/ARENA.md 10). The host shows it under the game's final board.
 */
import { useEffect, useRef } from 'react';
import { formatLine, strings, type ArenaGameRecord, type ArenaRunRecord } from '../../game';
import type { Locale, Outcome } from '../../games/contract';
import { SystemWindow } from '../SystemWindow';

const t = strings.arena.host;

interface Props {
  outcome: Outcome;
  record: ArenaGameRecord | null;
  /** The run's record when this game ended the run. */
  ended: ArenaRunRecord | null;
  /** The game's answer could not be read and was counted as leaving. */
  invalid: boolean;
  locale: Locale;
  onContinue: () => void;
}

export function ResultPanel({ outcome, record, ended, invalid, locale, onContinue }: Props) {
  // Focus lands on the panel, so a screen reader reads the result before the way on.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  // What the engine kept (cleaned and cut) is what the Run log will show, so show the same.
  const learned = record?.learned ?? outcome.learned;
  const title = outcome.result === 'won' ? t.resultWon : outcome.result === 'lost' ? t.resultLost : t.resultFled;
  const tone = outcome.result === 'won' ? 'success' : 'default';
  return (
    <div ref={ref} tabIndex={-1} role="group" aria-label={t.resultHeading} style={{ outline: 'none' }}>
      <SystemWindow title={t.resultHeading} tone={tone} headingLevel={2} data-testid="arena-result">
        <div role="status" aria-live="polite">
          <p>
            <strong data-testid="arena-result-title">{title}</strong> · {formatLine(t.scoreLine, { score: outcome.score })}
          </p>
          {record && record.coins > 0 ? <p>{formatLine(t.coinsLine, { coins: record.coins })}</p> : null}
          {ended ? <p>{formatLine(t.homeLine, { coins: ended.coins })}</p> : null}
          {invalid ? <p>{t.invalid}</p> : null}
        </div>
        {outcome.log.length > 0 ? (
          <>
            <h3>{t.logHeading}</h3>
            <ul>
              {outcome.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {learned ? (
          <>
            <h3>{t.learnedHeading}</h3>
            <p lang={locale}>
              <strong>{learned.topic[locale]}</strong>: {learned.note[locale]}
            </p>
          </>
        ) : null}
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          {t.continue}
        </button>
      </SystemWindow>
    </div>
  );
}
