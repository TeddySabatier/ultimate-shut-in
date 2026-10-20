/**
 * Every game the Arena lists (docs/design/ARENA.md 10): name and tagline in
 * the player's language, category, the ring it opens at, party size,
 * minutes, and what a learning game teaches.
 */
import { formatLine, strings } from '../../game';
import type { GameModule, Locale } from '../../games/contract';
import { SystemWindow } from '../SystemWindow';
import styles from './arena.module.css';

const u = strings.arena.ui;

interface Props {
  games: readonly GameModule[];
  locale: Locale;
  ring: number;
}

export function GameList({ games, locale, ring }: Props) {
  return (
    <SystemWindow title={u.games.heading}>
      {games.length === 0 ? (
        <p className={styles.note}>{u.entry.noGames}</p>
      ) : (
        <ul className={styles.list} data-testid="arena-games">
          {games.map(({ manifest: m }) => {
            const locked = m.minRing > ring;
            const party = m.rosterSize.min === m.rosterSize.max ? formatLine(u.games.partyExact, { min: m.rosterSize.min }) : formatLine(u.games.party, { min: m.rosterSize.min, max: m.rosterSize.max });
            return (
              <li key={m.id} className={styles.game} lang={locale}>
                <h3 className={styles.gameName}>{m.name[locale]}</h3>
                <p className={styles.line}>{m.tagline[locale]}</p>
                <p className={styles.facts} lang="en">
                  <span className={styles.tag}>{u.games.categories[m.category]}</span>
                  {locked ? <span className={styles.tag}>{formatLine(u.games.locked, { ring: m.minRing })}</span> : null}
                  <span>{party}</span>
                  <span>{formatLine(u.games.minutes, { minutes: m.estMinutes })}</span>
                </p>
                {m.learning ? <p className={styles.note}>{formatLine(u.games.teaches, { skill: m.learning.skill[locale] })}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </SystemWindow>
  );
}
