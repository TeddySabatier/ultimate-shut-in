/**
 * Weight Garden screen: the plot, the readouts, the controls of the current
 * plot (weight sliders, learning rate, Train, hidden neurons), the curves and
 * the drawing of the network. State comes only from the engine through
 * `useEngine`; every word comes from `strings`.
 */
import { useEffect, useId, type ReactNode } from 'react';
import { SystemWindow } from '../../components/SystemWindow';
import { cx } from '../../utils/cx';
import { formatText, type GameScreenProps } from '../contract';
import { useEngine } from '../ui/useEngine';
import { coachFor } from './coach';
import { AccChart, LossChart } from './Charts';
import {
  engine,
  isOver,
  kindOf,
  LR_STEPS,
  MAX_HIDDEN,
  roomConfig,
  roomPassed,
  roundsLeft,
  testPct,
  tryNumber,
  trainPct,
  WEIGHT_LIMIT,
  type WeightGardenState,
} from './engine';
import { fmtLoss } from './format';
import game from './manifest';
import { NetDiagram, PlotView } from './Plot';
import { strings } from './strings';
import styles from './Screen.module.css';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range';
}

/** A signed number for an equation: "+ 0.4" or "- 0.4" (a real minus sign), first term bare. */
function signed(n: number): string {
  return `${n < 0 ? '−' : '+'} ${Math.abs(n).toFixed(2)}`;
}
function plain(n: number): string {
  return `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
}

function nearestLrIndex(lr: number): number {
  let best = 0;
  for (let i = 1; i < LR_STEPS.length; i++) {
    if (Math.abs((LR_STEPS[i] ?? 0) - lr) < Math.abs((LR_STEPS[best] ?? 0) - lr)) best = i;
  }
  return best;
}

function Readout({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className={styles.readout}>
      <dt>{label}</dt>
      <dd className="mono" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function PlotsStrip({ state, locale }: { state: WeightGardenState; locale: 'en' | 'fr' }) {
  const s = strings[locale];
  return (
    <ol className={styles.plots} aria-label={s.plots.label}>
      {state.plan.map((kind, i) => {
        const done = i < state.room || state.won;
        const now = i === state.room && !state.won;
        const status = done ? s.plots.done : now ? s.plots.now : s.plots.ahead;
        return (
          <li key={kind} className={cx(styles.plotStep, done && styles.stepDone, now && styles.stepNow)} aria-current={now ? 'step' : undefined}>
            <svg viewBox="0 0 24 24" className={styles.sprout} aria-hidden="true">
              {done ? (
                <>
                  <line x1="12" y1="22" x2="12" y2="11" className={styles.stem} />
                  <circle cx="12" cy="8" r="4" className={styles.flower} />
                  <circle cx="12" cy="8" r="1.4" className={styles.flowerHeart} />
                </>
              ) : now ? (
                <>
                  <line x1="12" y1="22" x2="12" y2="12" className={styles.stem} />
                  <path d="M12 14 C 6 14 5 8 5 8 C 11 8 12 11 12 14 Z M12 12 C 18 12 19 6 19 6 C 13 6 12 9 12 12 Z" className={styles.leaf} />
                </>
              ) : (
                <ellipse cx="12" cy="18" rx="3.5" ry="2.4" className={styles.seedDot} />
              )}
            </svg>
            <span className="srOnly">{formatText(s.plots.item, { n: i + 1, state: status })}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function WeightGardenScreen(props: GameScreenProps) {
  const { locale, reducedMotion } = props;
  const s = strings[locale];
  const { state, dispatch, outcome, exit } = useEngine(engine, props);
  const uid = useId();
  const over = isOver(state);
  const kind = kindOf(state);
  const passed = roomPassed(state);
  const room = s.rooms[kind];
  const cfg = roomConfig(kind, state.difficulty);
  const hand = kind === 'line';
  const hasHidden = kind === 'xor' || kind === 'noise' || kind === 'boss';
  const showTest = kind === 'noise' || kind === 'boss';
  const lastPlot = state.room + 1 >= state.plan.length;
  const coach = coachFor(state);
  const coachText = ((s.coach as unknown as Record<string, Record<string, string>>)[coach.kind] ?? {})[coach.key] ?? '';
  const tr = trainPct(state);
  const te = testPct(state);
  const live = showTest
    ? formatText(s.live.both, { acc: tr, test: te, loss: fmtLoss(state.loss) })
    : formatText(s.live.train, { acc: tr, loss: fmtLoss(state.loss) });
  const goalText = formatText(s.goalLabel[kind], { loss: state.targetLoss.toFixed(2), goal: state.goalPct });
  const lrIndex = nearestLrIndex(state.lr);

  useEffect(() => {
    if (over) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 't') dispatch({ type: 'step' });
      else if (k === 'a') dispatch({ type: 'addNeuron' });
      else if (k === 'r') dispatch({ type: 'removeNeuron' });
      else if (k === 'h') dispatch({ type: 'hint' });
      else if (k === 'n') dispatch({ type: 'nextRoom' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, dispatch]);

  const perks: string[] = [];
  if (state.moveBoost > 0) perks.push(formatText(s.perks.move, { n: state.moveBoost }));
  if (state.sleepBonus > 0) perks.push(formatText(s.perks.sleep, { n: state.sleepBonus }));
  if (state.showAdvice) perks.push(s.perks.study);
  if (state.luckPoints >= 5) perks.push(formatText(s.perks.luck, { n: 1 + Math.floor(state.luckPoints / 5) }));
  if (state.hints > 0 || state.hintOn) perks.push(formatText(s.perks.hint, { n: state.hints }));
  if (state.revives > 0) perks.push(formatText(s.perks.revive, { n: state.revives }));
  if (perks.length === 0) perks.push(s.perks.none);

  const w = state.net;
  const weightRows: { slot: number; label: string; value: number }[] = [
    { slot: 0, label: s.controls.weightX, value: w.ow[0] ?? 0 },
    { slot: 1, label: s.controls.weightY, value: w.ow[1] ?? 0 },
    { slot: 2, label: s.controls.bias, value: w.ob },
  ];

  let curve: ReactNode = null;
  if (!hand) {
    curve = showTest ? (
      <AccChart history={state.history} budget={state.budget} locale={locale} goal={state.goalPct} />
    ) : (
      <LossChart history={state.history} budget={state.budget} locale={locale} target={state.targetLoss} />
    );
  }

  const settledNote = passed && !over ? room.learned : null;

  return (
    <SystemWindow className={cx(styles.garden, reducedMotion && styles.still)} title={game.manifest.name[locale]} headingLevel={2} tone={outcome?.result === 'won' ? 'success' : 'default'}>
      <div className={styles.topBar}>
        <PlotsStrip state={state} locale={locale} />
        <div className={styles.topButtons}>
          {over ? null : (
            <button type="button" className="btn btn--danger btn--sm" onClick={() => dispatch({ type: 'forfeit' })} data-testid="weight-garden-forfeit">
              {s.controls.forfeit}
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={exit} data-testid="weight-garden-leave">
            {s.controls.leave}
          </button>
        </div>
      </div>

      <p className={styles.intro}>{s.intro}</p>

      <div className={styles.titleRow}>
        <h3 className={styles.plotTitle} data-testid="weight-garden-plot-title">
          {formatText(s.hud.plot, { n: state.room + 1, total: state.plan.length })}: {room.title}
        </h3>
        {hand ? null : (
          <p className={cx(styles.tries, 'mono')} data-testid="weight-garden-tries">
            {formatText(s.hud.tries, { n: tryNumber(state), max: state.maxTries })}
          </p>
        )}
      </div>
      <p className={styles.goal} data-testid="weight-garden-goal">
        <strong>{s.hud.goal}.</strong> {goalText}
      </p>

      <div className={styles.layout}>
        <div className={styles.colA}>
          <PlotView net={state.net} seeds={state.seeds} label={live} ghost={hand && state.hintOn} />
          <p className={cx(styles.live, 'mono')} aria-live="polite" aria-atomic="true" data-testid="weight-garden-live">
            {live}
          </p>
          <dl className={styles.readouts}>
            <Readout label={s.hud.right} value={`${state.trainOk}/${state.trainN} · ${tr}%`} testId="weight-garden-train" />
            <Readout label={s.hud.test} value={`${state.testOk}/${state.testN} · ${te}%`} testId="weight-garden-test" />
            <Readout label={s.hud.loss} value={fmtLoss(state.loss)} testId="weight-garden-loss" />
            {hand ? null : <Readout label={s.hud.steps} value={String(state.steps)} testId="weight-garden-steps" />}
          </dl>
          {hand ? null : (
            <p className={cx(styles.presses, 'mono')} data-testid="weight-garden-presses">
              {formatText(s.hud.presses, { n: roundsLeft(state), total: state.budget })}
            </p>
          )}
          <details className={styles.details}>
            <summary>{s.legend.title}</summary>
            <ul className={styles.legend}>
              <li>{s.legend.seeds}</li>
              <li>{s.legend.guess}</li>
              <li>{s.legend.loss}</li>
              <li>{s.legend.weights}</li>
            </ul>
          </details>
        </div>

        <div className={styles.colB}>
          <p className={styles.blurb}>{formatText(room.blurb, { n: cfg.batch + state.moveBoost })}</p>
          {state.hintOn ? <p className={styles.hintText}>{room.hint}</p> : null}

          <section className={styles.coach} aria-labelledby={`${uid}-coach`}>
            <h4 id={`${uid}-coach`} className={styles.coachTitle}>
              {state.showAdvice ? s.coach.studyTitle : s.coach.title}
            </h4>
            <p className={styles.facts} data-testid="weight-garden-facts">
              {hand
                ? formatText(s.coach.facts.line, { right: state.trainOk, n: state.trainN })
                : showTest
                  ? formatText(s.coach.facts.gap, { tr, te })
                  : state.history.length > 1
                    ? formatText(s.coach.facts.loss, { from: fmtLoss(state.history[0]?.l ?? 0), to: fmtLoss(state.history[state.history.length - 1]?.l ?? 0) })
                    : formatText(s.coach.facts.line, { right: state.trainOk, n: state.trainN })}
            </p>
            <p className={styles.advice} aria-live="polite" data-testid="weight-garden-coach">
              {state.showAdvice || hand ? coachText : s.coach.noStudy}
            </p>
          </section>

          {over ? null : (
            <div className={styles.controls}>
              {hand ? (
                <>
                  <p className={cx(styles.equation, 'mono')} data-testid="weight-garden-equation">
                    {formatText(s.controls.equation, { a: plain(w.ow[0] ?? 0), b: signed(w.ow[1] ?? 0), c: signed(w.ob) })}
                  </p>
                  <ul className={styles.sliders}>
                    {weightRows.map((r) => (
                      <li key={r.slot} className={styles.field}>
                        <label htmlFor={`${uid}-w${r.slot}`}>
                          {r.label}: <span className="mono">{r.value.toFixed(1)}</span>
                        </label>
                        <input
                          id={`${uid}-w${r.slot}`}
                          className={styles.slider}
                          type="range"
                          min={-WEIGHT_LIMIT}
                          max={WEIGHT_LIMIT}
                          step={0.1}
                          value={r.value}
                          aria-valuetext={`${r.label} ${r.value.toFixed(1)}`}
                          data-testid={`weight-garden-w${r.slot}`}
                          onChange={(e) => dispatch({ type: 'setWeight', slot: r.slot, value: Number(e.target.value) })}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <div className={styles.field}>
                    <label htmlFor={`${uid}-lr`}>
                      {s.controls.rate}: <span className="mono">{state.lr.toFixed(2)}</span>
                    </label>
                    <input
                      id={`${uid}-lr`}
                      className={styles.slider}
                      type="range"
                      min={0}
                      max={LR_STEPS.length - 1}
                      step={1}
                      value={lrIndex}
                      aria-valuetext={formatText(s.controls.rateValue, { lr: (LR_STEPS[lrIndex] ?? state.lr).toFixed(2) })}
                      data-testid="weight-garden-lr"
                      onChange={(e) => dispatch({ type: 'setLearningRate', value: LR_STEPS[Number(e.target.value)] ?? state.lr })}
                    />
                    <span className={styles.ends} aria-hidden="true">
                      <span>{s.controls.rateSlow}</span>
                      <span>{s.controls.rateHigh}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className={cx('btn', 'btn--primary', 'btn--block', styles.train)}
                    disabled={state.rounds >= state.budget}
                    onClick={() => dispatch({ type: 'step' })}
                    data-testid="weight-garden-train-button"
                  >
                    {s.controls.train}
                    <span className={styles.trainSub}>{formatText(s.controls.trainTitle, { n: state.batch })}</span>
                  </button>
                  {hasHidden ? (
                    <div className={styles.neurons}>
                      <button type="button" className="btn" onClick={() => dispatch({ type: 'removeNeuron' })} disabled={state.net.hidden === 0} data-testid="weight-garden-remove">
                        {s.controls.removeNeuron}
                      </button>
                      <p className={cx(styles.hiddenCount, 'mono')} data-testid="weight-garden-hidden">
                        {state.net.hidden === 0 ? s.hud.oneNeuron : formatText(s.hud.hidden, { n: state.net.hidden })}
                      </p>
                      <button type="button" className="btn" onClick={() => dispatch({ type: 'addNeuron' })} disabled={state.net.hidden >= MAX_HIDDEN} data-testid="weight-garden-add">
                        {s.controls.addNeuron}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
              {state.hints > 0 || state.hintOn ? (
                <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: 'hint' })} disabled={state.hintOn || state.hints < 1} data-testid="weight-garden-hint">
                  {state.hintOn ? s.controls.hintUsed : formatText(s.controls.hint, { n: state.hints })}
                </button>
              ) : null}
              <p className={cx('muted', styles.keys)}>{s.controls.keys}</p>
            </div>
          )}

          {settledNote ? (
            <section className={styles.settled} aria-labelledby={`${uid}-settled`} data-testid="weight-garden-settled">
              <h4 id={`${uid}-settled`} className={styles.settledTitle}>
                {s.settled.ready} {s.settled.title}
              </h4>
              <p>{settledNote}</p>
              <button type="button" className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'nextRoom' })} data-testid="weight-garden-next">
                {lastPlot ? s.controls.finish : s.controls.next}
              </button>
            </section>
          ) : null}

          {curve}

          <figure className={styles.netFigure}>
            <NetDiagram net={state.net} locale={locale} />
            <details className={styles.details}>
              <summary>{s.net.numbers}</summary>
              <ul className={cx(styles.numbers, 'mono')}>
                {state.net.hidden === 0 ? (
                  <li>{formatText(s.net.single, { a: plain(w.ow[0] ?? 0), b: signed(w.ow[1] ?? 0), c: signed(w.ob) })}</li>
                ) : (
                  <>
                    {Array.from({ length: state.net.hidden }, (_, j) => (
                      <li key={j}>
                        {formatText(s.net.neuron, {
                          n: j + 1,
                          a: plain(w.hw[j * 2] ?? 0),
                          b: signed(w.hw[j * 2 + 1] ?? 0),
                          c: signed(w.hb[j] ?? 0),
                          o: plain(w.ow[j] ?? 0),
                        })}
                      </li>
                    ))}
                    <li>{formatText(s.net.outBias, { b: plain(w.ob) })}</li>
                  </>
                )}
              </ul>
            </details>
          </figure>

          <details className={styles.details}>
            <summary>{s.perks.title}</summary>
            <ul className={styles.perks}>
              {perks.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {outcome ? (
        <section className={styles.end} data-result={outcome.result} aria-label={s.end[outcome.result]}>
          <p className={styles.banner} role="status" data-testid="weight-garden-result">
            {s.end[outcome.result]}
          </p>
          {state.cleared.length > 0 ? (
            <ol className={styles.recap}>
              {state.cleared.map((c) => (
                <li key={c.room}>
                  <strong>{s.rooms[state.plan[c.room] ?? 'line'].title}.</strong> {s.rooms[state.plan[c.room] ?? 'line'].learned}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </SystemWindow>
  );
}
