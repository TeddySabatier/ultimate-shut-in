import { Component, useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SystemWindow } from '../../components/SystemWindow';
import { fitParty, fledOutcome, type GameModule, type GameScreenProps, type Outcome } from '../contract';
import { getGame, loadScreen } from '../registry';
import { stableStringify } from '../testing/checks';
import { parties, runs } from '../testing/fixtures';
import { DEFAULT_MAX_STEPS, playToEnd } from '../testing/play';
import { outcomeProblems } from '../testing/validate';
import { LAB_PARTIES, LAB_RUNS, browserEnv, labRun, parseLabParams, randomSeed, toSearch, type Difficulty, type LabParams, type LabParty, type LabRun } from './labParams';
import styles from './Lab.module.css';

type ScreenState = { id: string; Screen: ComponentType<GameScreenProps> | null; error: string | null };

/** The game's Screen, loaded on demand through the registry (its own chunk). */
function useGameScreen(id: string): ScreenState {
  const [state, setState] = useState<ScreenState>({ id, Screen: null, error: null });
  useEffect(() => {
    let live = true;
    loadScreen(id).then(
      (Screen) => live && setState({ id, Screen, error: null }),
      (e: unknown) => live && setState({ id, Screen: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return state.id === id ? state : { id, Screen: null, error: null };
}

export interface LabResult {
  source: 'player' | 'bot' | 'exit';
  outcome: Outcome | null;
  /** Bot play: number of actions, or why it stopped. */
  note?: string;
}

/** Same outcome, ignoring the wall-clock duration. */
function outcomeKey(o: Outcome | null): string {
  if (!o) return 'none';
  const { durationMs: _ignored, ...rest } = o;
  return stableStringify(rest);
}

/** A crash in a game's Screen shows here instead of taking the Lab down. */
class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <SystemWindow title="The game crashed" tone="danger">
          <pre className={styles.error}>{this.state.error.message}</pre>
        </SystemWindow>
      );
    }
    return this.props.children;
  }
}

/** `#/lab/:id`: play one game with the test fixtures. */
export function LabGame() {
  const { id = '' } = useParams();
  const game = getGame(id);
  if (!game) {
    return (
      <main className={styles.lab} id="main">
        <h1>No game "{id}"</h1>
        <p>
          There is no <code>src/games/{id}/manifest.ts</code>. <Link to="/lab">Back to the Games Lab</Link>
        </p>
      </main>
    );
  }
  return <LabPlayer game={game} />;
}

function LabPlayer({ game }: { game: GameModule }) {
  const { manifest } = game;
  const [search, setSearch] = useSearchParams();
  const params = parseLabParams(search, browserEnv());
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<LabResult | null>(null);
  const [previous, setPrevious] = useState<LabResult | null>(null);

  // Every game in the Lab has a seed in the URL, so "Replay same seed" and a shared link reproduce it.
  const missingSeed = params.seed === null;
  useEffect(() => {
    if (missingSeed) setSearch(toSearch({ ...params, seed: randomSeed() }), { replace: true });
  });

  const update = useCallback(
    (patch: Partial<LabParams>) => {
      setSearch(toSearch({ ...params, ...patch }), { replace: true });
      setResult(null);
      setPrevious(null);
    },
    [params, setSearch],
  );

  const party = useMemo(() => fitParty(parties[params.party], manifest), [params.party, manifest]);
  const run = useMemo(() => labRun(runs[params.run], params.difficulty), [params.run, params.difficulty]);
  const seed = params.seed ?? 0;
  const { Screen, error: loadError } = useGameScreen(manifest.id);

  const replay = () => {
    setPrevious(result);
    setResult(null);
    setNonce((n) => n + 1);
  };
  const botPlay = () => {
    const r = playToEnd(game, seed, party, run, DEFAULT_MAX_STEPS, { locale: params.locale });
    setPrevious(result);
    setResult({ source: 'bot', outcome: r.outcome, note: r.outcome ? `${r.steps} actions` : `stopped without an outcome (${r.stopped ?? 'unknown'}) after ${r.steps} actions` });
  };
  const onFinish = useCallback((outcome: Outcome) => setResult({ source: 'player', outcome }), []);
  const onExit = useCallback(() => setResult((r) => (r?.source === 'player' ? { ...r, note: 'The player left after the end.' } : { source: 'exit', outcome: fledOutcome() })), []);
  const onSeedSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get('seed');
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) update({ seed: n >>> 0 });
  };

  if (missingSeed) return null;
  const locale = params.locale;
  const sameAsPrevious = result && previous ? outcomeKey(result.outcome) === outcomeKey(previous.outcome) : null;

  return (
    <main className={styles.lab} id="main">
      <header className={styles.header}>
        <Link to="/lab" className={styles.back}>
          Games Lab
        </Link>
        <h1 lang={locale}>{manifest.name[locale]}</h1>
        <p className={styles.tagline} lang={locale}>
          {manifest.tagline[locale]}
        </p>
        <p className={styles.chips}>
          <span className={styles.chip}>{manifest.category}</span>
          <span className={styles.chip}>~{manifest.estMinutes} min</span>
          <span className={styles.chip}>seed {seed}</span>
          {manifest.devOnly ? <span className={`${styles.chip} ${styles.dev}`}>dev only</span> : null}
        </p>
      </header>

      <div className={styles.layout}>
        <section className={styles.stage} aria-label="Game" data-testid="lab-stage" lang={locale}>
          <ScreenBoundary key={`${manifest.id}:${seed}:${params.party}:${params.run}:${run.difficulty}:${locale}:${params.reducedMotion}:${nonce}`}>
            {Screen ? (
              <Screen party={party} seed={seed} run={run} locale={locale} reducedMotion={params.reducedMotion} onFinish={onFinish} onExit={onExit} />
            ) : (
              <p className="muted">{loadError ?? 'Loading the game...'}</p>
            )}
          </ScreenBoundary>
        </section>

        <div className={styles.side}>
          <section className={styles.panel} aria-labelledby="lab-outcome-title" data-testid="lab-outcome">
            <h2 id="lab-outcome-title">Outcome</h2>
            {result ? <OutcomeView result={result} party={party.members} locale={locale} /> : <p className="muted">No outcome yet. Play the game, or press Bot play.</p>}
            {sameAsPrevious === null ? null : (
              <p className={sameAsPrevious ? styles.same : styles.differs} data-testid="lab-compare">
                {sameAsPrevious ? 'Matches the previous run.' : 'Differs from the previous run.'}
              </p>
            )}
            <div className={styles.buttons}>
              <button type="button" className="btn btn--primary" onClick={replay}>
                Replay same seed
              </button>
              <button type="button" className="btn" onClick={botPlay}>
                Bot play
              </button>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="lab-controls-title">
            <h2 id="lab-controls-title">Lab controls</h2>
            <form className={styles.seedRow} onSubmit={onSeedSubmit} key={seed}>
              <label className={styles.field}>
                <span>Seed</span>
                <input name="seed" type="number" inputMode="numeric" min={0} defaultValue={seed} />
              </label>
              <button type="submit" className="btn">
                Apply
              </button>
              <button type="button" className="btn" onClick={() => update({ seed: randomSeed() })}>
                New seed
              </button>
            </form>
            <label className={styles.field}>
              <span>Language</span>
              <select value={locale} onChange={(e) => update({ locale: e.target.value === 'fr' ? 'fr' : 'en' })}>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Party</span>
              <select value={params.party} onChange={(e) => update({ party: e.target.value as LabParty })}>
                {LAB_PARTIES.map((p) => (
                  <option key={p} value={p}>
                    {PARTY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Run</span>
              <select value={params.run} onChange={(e) => update({ run: e.target.value as LabRun })}>
                {LAB_RUNS.map((r) => (
                  <option key={r} value={r}>
                    {RUN_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Difficulty</span>
              <select value={params.difficulty ?? ''} onChange={(e) => update({ difficulty: e.target.value === '' ? null : (Number(e.target.value) as Difficulty) })}>
                <option value="">From the run ({runs[params.run].difficulty})</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.toggle}>
              <input type="checkbox" checked={params.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
              <span>Reduced motion</span>
            </label>
          </section>
        </div>
      </div>
    </main>
  );
}

const PARTY_LABELS: Record<LabParty, string> = {
  full: 'Full: 8 vassals, level 12',
  starter: 'Starter: 3 vassals, level 1',
  single: 'Single: 1 vassal, level 5',
  mixed: 'Mixed: a citizen and 4 vassals',
};

const RUN_LABELS: Record<LabRun, string> = {
  plain: 'Plain: no buffs',
  buffed: 'Buffed: attack, time and hint',
  hard: 'Hard: room 4, no buffs',
};

/** The Outcome panel's content; invalid outcomes are listed in red. */
export function OutcomeView({ result, party, locale }: { result: LabResult; party: { id: string; name: string }[]; locale: 'en' | 'fr' }) {
  const o = result.outcome;
  const source = { player: 'Played', bot: 'Bot play', exit: 'Left the game (onExit)' }[result.source];
  if (!o) {
    return (
      <p data-testid="lab-outcome-result">
        {source}: no outcome{result.note ? `, ${result.note}` : ''}.
      </p>
    );
  }
  const names = o.troopsUsed.map((id) => party.find((m) => m.id === id)?.name ?? id);
  const problems = outcomeProblems(o, party.map((m) => m.id));
  return (
    <>
      {problems.length > 0 ? (
        <div className={styles.problems} role="alert" data-testid="lab-outcome-problems">
          <strong>Invalid outcome</strong>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className={styles.facts}>
        <Fact term="Source">
          {source}
          {result.note ? ` (${result.note})` : ''}
        </Fact>
        <Fact term="Result" testId="lab-outcome-result">
          {o.result}
        </Fact>
        <Fact term="Score" testId="lab-outcome-score" mono>
          {o.score}
        </Fact>
        <Fact term="Troops">{names.length > 0 ? names.join(', ') : 'none'}</Fact>
        {o.durationMs === undefined ? null : (
          <Fact term="Duration" mono>
            {(o.durationMs / 1000).toFixed(1)} s
          </Fact>
        )}
        {Object.entries(o.stats ?? {}).map(([k, v]) => (
          <Fact key={k} term={k} mono>
            {v}
          </Fact>
        ))}
      </dl>
      <ol className={styles.log} data-testid="lab-outcome-log" lang={locale}>
        {o.log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      {o.learned ? (
        <p className={styles.learned} lang={locale}>
          <strong>{o.learned.topic[locale]}</strong>: {o.learned.note[locale]}
        </p>
      ) : null}
    </>
  );
}

function Fact({ term, children, testId, mono = false }: { term: string; children: ReactNode; testId?: string; mono?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt>{term}</dt>
      <dd data-testid={testId} className={mono ? 'mono' : undefined}>
        {children}
      </dd>
    </div>
  );
}
