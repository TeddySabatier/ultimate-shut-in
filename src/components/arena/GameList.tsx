import { strings } from '../../game';
import { SystemWindow } from '../SystemWindow';
import { listedGames } from './host/catalog';
import { NoGamesYet } from './host/ArenaHost';
import styles from './arena.module.css';

const a = strings.arena;

export function GameList({ ring }: { ring: number }) {
  const games = listedGames().filter((g) => g.manifest.minRing <= ring);
  return (
    <SystemWindow title={a.gamesTitle} data-testid="arena-games">
      {games.length === 0 ? (
        <NoGamesYet />
      ) : (
        <ul className={styles.games}>
          {games.map((g) => (
            <li key={g.manifest.id} className={styles.game}>
              <p className={styles.name}>{g.manifest.name.en}</p>
              <p className={styles.meta}>{g.manifest.tagline.en}</p>
              {g.manifest.learning ? (
                <p className={styles.meta}>
                  {a.gamesTeach}: {g.manifest.learning.skill.en}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SystemWindow>
  );
}
