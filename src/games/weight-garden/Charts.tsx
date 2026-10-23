/**
 * The two curves of the garden: the loss after each Train press, and the
 * training and test accuracy after each press (the overfitting picture).
 * SVG drawn in code; the text alternative carries the same numbers.
 */
import type { HistoryEntry } from './engine';
import { accAlt, lossAlt } from './format';
import { strings } from './strings';
import styles from './Screen.module.css';

const W = 120;
const H = 64;
const PAD_L = 8;
const PAD_R = 4;
const PAD_T = 4;
const PAD_B = 8;
const LOSS_MAX = 1.6;

function px(i: number, slots: number): number {
  const span = W - PAD_L - PAD_R;
  return PAD_L + (slots <= 1 ? 0 : (i / (slots - 1)) * span);
}
function py(frac: number): number {
  return PAD_T + (1 - Math.max(0, Math.min(1, frac))) * (H - PAD_T - PAD_B);
}

interface ChartProps {
  /** How the try began, then one entry per press. */
  start: HistoryEntry;
  history: readonly HistoryEntry[];
  /** Presses a try may use: the x axis is always this wide, so the empty part shows what is left. */
  budget: number;
  locale: 'en' | 'fr';
}

export function LossChart({ start, history: pressed, budget, locale, target }: ChartProps & { target: number }) {
  const s = strings[locale].chart;
  const history = [start, ...pressed];
  const slots = Math.max(budget + 1, 2);
  const pts = history.map((h, i) => `${px(i, slots).toFixed(1)},${py(Math.min(h.l, LOSS_MAX) / LOSS_MAX).toFixed(1)}`);
  const spikes = history.map((h, i) => (h.l > LOSS_MAX ? i : -1)).filter((i) => i >= 0);
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={lossAlt(history, locale)} data-testid="weight-garden-loss-chart">
        <line x1={PAD_L} y1={py(0)} x2={W - PAD_R} y2={py(0)} className={styles.chartAxis} />
        <line x1={PAD_L} y1={py(0)} x2={PAD_L} y2={py(1)} className={styles.chartAxis} />
        {target > 0 ? <line x1={PAD_L} y1={py(target / LOSS_MAX)} x2={W - PAD_R} y2={py(target / LOSS_MAX)} className={styles.chartGoal} /> : null}
        {pts.length > 1 ? <polyline points={pts.join(' ')} className={styles.chartLoss} /> : null}
        {history.map((h, i) => (
          <circle key={i} cx={px(i, slots)} cy={py(Math.min(h.l, LOSS_MAX) / LOSS_MAX)} r={1.6} className={h.l > LOSS_MAX ? styles.chartSpike : styles.chartDot} />
        ))}
        {spikes.map((i) => (
          <text key={i} x={px(i, slots)} y={py(1) + 6} textAnchor="middle" className={styles.chartMark}>
            !
          </text>
        ))}
        <text x={PAD_L + 1.5} y={PAD_T + 8} className={styles.chartText}>
          {s.lossKey}
        </text>
        <text x={W - PAD_R} y={H - 1} textAnchor="end" className={styles.chartText}>
          {s.budget}
        </text>
      </svg>
      <figcaption className={styles.srOnlyLocal}>{lossAlt(history, locale)}</figcaption>
    </figure>
  );
}

export function AccChart({ start, history: pressed, budget, locale, goal }: ChartProps & { goal: number }) {
  const s = strings[locale].chart;
  const history = [start, ...pressed];
  const slots = Math.max(budget + 1, 2);
  const line = (pick: (h: HistoryEntry) => number) => history.map((h, i) => `${px(i, slots).toFixed(1)},${py(pick(h) / 100).toFixed(1)}`).join(' ');
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={accAlt(history, locale)} data-testid="weight-garden-acc-chart">
        <line x1={PAD_L} y1={py(0)} x2={W - PAD_R} y2={py(0)} className={styles.chartAxis} />
        <line x1={PAD_L} y1={py(0)} x2={PAD_L} y2={py(1)} className={styles.chartAxis} />
        <line x1={PAD_L} y1={py(goal / 100)} x2={W - PAD_R} y2={py(goal / 100)} className={styles.chartGoal} />
        {history.length > 1 ? <polyline points={line((h) => h.tr)} className={styles.chartTrain} /> : null}
        {history.length > 1 ? <polyline points={line((h) => h.te)} className={styles.chartTest} /> : null}
        {history.map((h, i) => (
          <g key={i}>
            <circle cx={px(i, slots)} cy={py(h.tr / 100)} r={1.5} className={styles.chartTrainDot} />
            <rect x={px(i, slots) - 1.4} y={py(h.te / 100) - 1.4} width={2.8} height={2.8} className={styles.chartTestDot} />
          </g>
        ))}
        <text x={W - PAD_R} y={PAD_T + 3} textAnchor="end" className={styles.chartText}>
          100%
        </text>
        <text x={W - PAD_R} y={H - 1} textAnchor="end" className={styles.chartText}>
          {s.budget}
        </text>
      </svg>
      <figcaption className={styles.legendRow}>
        <span className={styles.keyTrain}>{s.trainKey}</span>
        <span className={styles.keyTest}>{s.testKey}</span>
      </figcaption>
    </figure>
  );
}
