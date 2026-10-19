import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../utils/cx';
import { GAME_CATEGORIES, type GameCategory } from '../contract';
import { listGames, validateRegistry } from '../registry';
import styles from './Lab.module.css';

/** `#/lab`: every game, dev-only ones included, with a category filter. */
export function LabHome() {
  const games = useMemo(() => listGames({ includeDev: true }), []);
  const problems = useMemo(() => validateRegistry(), []);
  const [filter, setFilter] = useState<GameCategory | null>(null);
  const categories = GAME_CATEGORIES.filter((c) => games.some((g) => g.manifest.category === c));
  const shown = filter ? games.filter((g) => g.manifest.category === filter) : games;

  return (
    <main className={styles.lab} id="main">
      <header className={styles.header}>
        <Link to="/" className={styles.back}>
          Back to the Haven
        </Link>
        <h1>Games Lab</h1>
        <p className={styles.lead}>
          A developer tool: play every mini game with test parties and runs. It never touches your save. {games.length} game
          {games.length === 1 ? '' : 's'} registered.
        </p>
      </header>

      {problems.length > 0 ? (
        <section className={styles.problems} aria-labelledby="lab-problems">
          <h2 id="lab-problems">Registry problems</h2>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.chips} role="group" aria-label="Filter by category">
        <button type="button" className={cx(styles.chip, styles.filter)} aria-pressed={filter === null} onClick={() => setFilter(null)}>
          All
        </button>
        {categories.map((c) => (
          <button key={c} type="button" className={cx(styles.chip, styles.filter)} aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      <ul className={styles.cards}>
        {shown.map(({ manifest: m }) => (
          <li key={m.id}>
            <article className={styles.card} aria-labelledby={`lab-game-${m.id}`}>
              <h2 id={`lab-game-${m.id}`} className={styles.cardTitle}>
                {m.name.en}
              </h2>
              <p className={styles.tagline}>{m.tagline.en}</p>
              <p className={styles.chips}>
                <span className={styles.chip}>{m.category}</span>
                <span className={styles.chip}>~{m.estMinutes} min</span>
                <span className={styles.chip}>
                  {m.rosterSize.min === m.rosterSize.max ? m.rosterSize.min : `${m.rosterSize.min}-${m.rosterSize.max}`} troops
                </span>
                <span className={styles.chip}>ring {m.minRing}+</span>
                {m.devOnly ? <span className={cx(styles.chip, styles.dev)}>dev only</span> : null}
              </p>
              <Link to={`/lab/${m.id}`} className="btn btn--primary" aria-label={`Play ${m.name.en}`}>
                Play
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
