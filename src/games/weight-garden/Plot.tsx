/**
 * The garden plot (seeds, the gardener's guess, its lines) and the drawing of
 * the network. Both are SVG drawn in code; the text beside them says the same
 * things for a screen reader.
 */
import { useMemo } from 'react';
import { centroidLine } from './data';
import { forward, guess, type Net, type Seed } from './net';
import { strings } from './strings';
import styles from './Screen.module.css';

const SPAN = 1.25;
const CELLS = 20;

function sx(x: number): number {
  return ((x + SPAN) / (2 * SPAN)) * 100;
}
function sy(y: number): number {
  return ((SPAN - y) / (2 * SPAN)) * 100;
}

/** The two ends of the line a x + b y + c = 0 across the plot, or null when it has no direction. */
function lineEnds(a: number, b: number, c: number): [number, number, number, number] | null {
  if (Math.abs(a) + Math.abs(b) < 0.02) return null;
  const R = 1.5;
  if (Math.abs(b) >= Math.abs(a)) return [sx(-R), sy(-(a * -R + c) / b), sx(R), sy(-(a * R + c) / b)];
  return [sx(-(b * R + c) / a), sy(R), sx(-(b * -R + c) / a), sy(-R)];
}

interface PlotProps {
  net: Net;
  seeds: readonly Seed[];
  label: string;
  /** Draw the suggested line (the hint on the hand-turned plot). */
  ghost: boolean;
}

export function PlotView({ net, seeds, label, ghost }: PlotProps) {
  const cells = useMemo(() => {
    const out: { x: number; y: number; v: number }[] = [];
    const step = (2 * SPAN) / CELLS;
    for (let i = 0; i < CELLS; i++) {
      for (let j = 0; j < CELLS; j++) {
        const x = -SPAN + (i + 0.5) * step;
        const y = SPAN - (j + 0.5) * step;
        out.push({ x: i * (100 / CELLS), y: j * (100 / CELLS), v: forward(net, x, y).out });
      }
    }
    return out;
  }, [net]);
  const size = 100 / CELLS;
  const main = net.hidden === 0 ? lineEnds(net.ow[0] ?? 0, net.ow[1] ?? 0, net.ob) : null;
  const hiddenLines =
    net.hidden === 0
      ? []
      : Array.from({ length: net.hidden }, (_, j) => lineEnds(net.hw[j * 2] ?? 0, net.hw[j * 2 + 1] ?? 0, net.hb[j] ?? 0));
  const g = ghost ? centroidLine(seeds) : null;
  const ghostEnds = g ? lineEnds(g.a, g.b, g.c) : null;
  return (
    <svg className={styles.plot} viewBox="0 0 100 100" role="img" aria-label={label} data-testid="weight-garden-plot">
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={size + 0.2}
          height={size + 0.2}
          className={c.v >= 0 ? (c.v > 0.6 ? styles.amberStrong : styles.amberSoft) : c.v < -0.6 ? styles.blueStrong : styles.blueSoft}
        />
      ))}
      <line x1={0} y1={50} x2={100} y2={50} className={styles.axis} />
      <line x1={50} y1={0} x2={50} y2={100} className={styles.axis} />
      {hiddenLines.map((e, i) => (e ? <line key={i} x1={e[0]} y1={e[1]} x2={e[2]} y2={e[3]} className={styles.hiddenLine} /> : null))}
      {main ? <line x1={main[0]} y1={main[1]} x2={main[2]} y2={main[3]} className={styles.boundary} /> : null}
      {ghostEnds ? <line x1={ghostEnds[0]} y1={ghostEnds[1]} x2={ghostEnds[2]} y2={ghostEnds[3]} className={styles.ghost} /> : null}
      {seeds.map((p, i) => {
        const cx = sx(p.x);
        const cy = sy(p.y);
        const wrong = guess(net, p.x, p.y) !== p.l;
        const kind = p.l > 0 ? styles.amberSeed : styles.blueSeed;
        const fill = p.t === 1 ? styles.solid : styles.hollow;
        return (
          <g key={i}>
            {wrong ? <circle cx={cx} cy={cy} r={4} className={styles.wrongRing} /> : null}
            {p.l > 0 ? (
              <circle cx={cx} cy={cy} r={2.1} className={`${kind} ${fill}`} />
            ) : (
              <rect x={cx - 1.9} y={cy - 1.9} width={3.8} height={3.8} className={`${kind} ${fill}`} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function edgeClass(w: number): string {
  return w >= 0 ? (styles.edgePos ?? '') : (styles.edgeNeg ?? '');
}
function edgeWidth(w: number): number {
  return 0.5 + Math.min(Math.abs(w), 3) * 0.9;
}

/** Inputs on the left, hidden neurons in the middle, one output on the right; thicker edge = bigger weight, colour = sign. */
export function NetDiagram({ net, locale }: { net: Net; locale: 'en' | 'fr' }) {
  const s = strings[locale].net;
  const inY = [22, 52];
  const h = net.hidden;
  const outX = 106;
  const outY = 37;
  const hy = Array.from({ length: h }, (_, j) => (h === 1 ? 37 : 8 + (j * 58) / (h - 1)));
  const label = h === 0 ? s.labelOne : s.label.replace('{n}', String(h));
  return (
    <svg className={styles.netSvg} viewBox="0 0 120 74" role="img" aria-label={label} data-testid="weight-garden-net">
      {h === 0
        ? inY.map((y, i) => <line key={i} x1={16} y1={y} x2={outX - 7} y2={outY} className={edgeClass(net.ow[i] ?? 0)} strokeWidth={edgeWidth(net.ow[i] ?? 0)} />)
        : hy.map((y, j) => (
            <g key={j}>
              {inY.map((iy, i) => (
                <line key={i} x1={16} y1={iy} x2={58} y2={y} className={edgeClass(net.hw[j * 2 + i] ?? 0)} strokeWidth={edgeWidth(net.hw[j * 2 + i] ?? 0)} />
              ))}
              <line x1={66} y1={y} x2={outX - 7} y2={outY} className={edgeClass(net.ow[j] ?? 0)} strokeWidth={edgeWidth(net.ow[j] ?? 0)} />
            </g>
          ))}
      {inY.map((y, i) => (
        <g key={i}>
          <circle cx={10} cy={y} r={6} className={styles.node} />
          <text x={10} y={y + 2.2} textAnchor="middle" className={styles.nodeText}>
            {i === 0 ? s.x : s.y}
          </text>
        </g>
      ))}
      {hy.map((y, j) => (
        <circle key={j} cx={62} cy={y} r={5.5} className={styles.node} />
      ))}
      <circle cx={outX} cy={outY} r={7} className={styles.node} />
      <text x={outX} y={outY + 12.5} textAnchor="middle" className={styles.nodeText}>
        {s.out}
      </text>
    </svg>
  );
}
