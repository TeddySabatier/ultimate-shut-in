/** The last runs, newest first, with what each game taught kept next to it (docs/design/ARENA.md 10). */
import { formatLine, getArenaItem, strings, type ArenaRunRecord } from '../../game';
import type { Locale } from '../../games/contract';
import { SystemWindow } from '../SystemWindow';
import { shortDate } from './format';
import styles from './arena.module.css';

const u = strings.arena.ui;
const l = u.runLog;

interface Props {
  log: readonly ArenaRunRecord[];
  locale: Locale;
  /** The game's name in the player's language, from the host's catalog. */
  gameName: (id: string) => string;
}

export function RunLog({ log, locale, gameName }: Props) {
  const runs = log.slice(-5).reverse();
  return (
    <SystemWindow title={l.heading} data-testid="arena-run-log">
      {runs.length === 0 ? (
        <p className={styles.note}>{l.empty}</p>
      ) : (
        <ul className={styles.list}>
          {runs.map((run) => {
            const item = run.itemId ? getArenaItem(run.itemId) : undefined;
            const gains = [
              run.coins > 0 ? formatLine(l.coins, { coins: run.coins }) : null,
              run.defense > 0 ? formatLine(l.defense, { defense: run.defense }) : null,
              item ? item.name : null,
            ].filter((x): x is string => x !== null);
            const learned = run.games.filter((g) => g.learned);
            return (
              <li key={run.id} className={styles.logRun}>
                <p className={styles.line}>
                  <strong>{l.ends[run.end]}</strong> · {formatLine(l.line, { date: shortDate(run.at), ring: run.ring, wins: run.wins })}
                </p>
                {gains.length > 0 ? <p className={styles.note}>{gains.join(' · ')}</p> : null}
                {learned.length > 0 ? (
                  <ul className={styles.learned}>
                    {learned.map((g) =>
                      g.learned ? (
                        <li key={`${g.gameId}-${g.room}`}>
                          <span className={styles.note}>{formatLine(l.learnedIn, { game: gameName(g.gameId) })}</span>
                          <p className={styles.line} lang={locale}>
                            <strong>{g.learned.topic[locale]}</strong>: {g.learned.note[locale]}
                          </p>
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SystemWindow>
  );
}
