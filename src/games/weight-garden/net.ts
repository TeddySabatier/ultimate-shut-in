/**
 * A tiny neural network, in plain arithmetic.
 *
 * Two inputs (x, y), either ONE neuron (a line) or a hidden layer of 2 to 4
 * "leaky ReLU" neurons feeding one output neuron. Loss is the mean squared miss
 * against targets of +1 and -1; the guess is the sign of the output.
 *
 * Only add, subtract, multiply, divide and comparison are used, so the same
 * seed replays identically on every device (no exp, tanh or fractional pow).
 */

/** A hidden neuron lets a little of a negative signal through, so none of them ever dies. */
export const LEAK = 0.1;
/** No weight leaves this range while training; it keeps every number finite. */
export const WEIGHT_CAP = 40;

export interface Net {
  /** 0 = one neuron on the two inputs; otherwise 2 to 4 hidden neurons. */
  hidden: number;
  /** Hidden weights, two per neuron: [x0, y0, x1, y1, ...]. Empty when `hidden` is 0. */
  hw: number[];
  /** One hidden bias per neuron. */
  hb: number[];
  /** Output weights: two (on x and y) when `hidden` is 0, else one per hidden neuron. */
  ow: number[];
  /** Output bias. */
  ob: number;
}

export interface Seed {
  x: number;
  y: number;
  /** The label the gardener trains on: +1 or -1. */
  l: number;
  /** 1 = a training seed, 0 = a test seed the gardener never trains on. */
  t: number;
}

/** Remove negative zero and non-finite values so states stay plain JSON. */
export function clean(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x === 0 ? 0 : x;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function round1(x: number): number {
  return clean(Math.round(x * 10) / 10);
}
export function round2(x: number): number {
  return clean(Math.round(x * 100) / 100);
}
export function round4(x: number): number {
  return clean(Math.round(x * 10000) / 10000);
}

function leaky(p: number): number {
  return p > 0 ? p : LEAK * p;
}
function leakyDeriv(p: number): number {
  return p > 0 ? 1 : LEAK;
}

export function zeroNet(hidden: number): Net {
  const h = hidden <= 0 ? 0 : hidden;
  return {
    hidden: h,
    hw: new Array<number>(h * 2).fill(0),
    hb: new Array<number>(h).fill(0),
    ow: new Array<number>(h === 0 ? 2 : h).fill(0),
    ob: 0,
  };
}

export function cloneNet(n: Net): Net {
  return { hidden: n.hidden, hw: n.hw.slice(), hb: n.hb.slice(), ow: n.ow.slice(), ob: n.ob };
}

/** A fresh random net. `rng` yields numbers in [0, 1). */
export function randomNet(rng: () => number, hidden: number): Net {
  const u = (s: number) => round4((rng() * 2 - 1) * s);
  if (hidden <= 0) return { hidden: 0, hw: [], hb: [], ow: [u(1), u(1)], ob: u(0.6) };
  const net = zeroNet(hidden);
  for (let j = 0; j < hidden; j++) {
    net.hw[j * 2] = u(2);
    net.hw[j * 2 + 1] = u(2);
    net.hb[j] = u(0.3);
    net.ow[j] = u(1);
  }
  net.ob = u(0.2);
  return net;
}

/** What the net says at (x, y): the raw output, and the hidden values on the way. */
export function forward(net: Net, x: number, y: number): { out: number; pre: number[]; act: number[] } {
  if (net.hidden === 0) {
    return { out: clean((net.ow[0] ?? 0) * x + (net.ow[1] ?? 0) * y + net.ob), pre: [], act: [] };
  }
  const pre: number[] = [];
  const act: number[] = [];
  let out = net.ob;
  for (let j = 0; j < net.hidden; j++) {
    const p = (net.hw[j * 2] ?? 0) * x + (net.hw[j * 2 + 1] ?? 0) * y + (net.hb[j] ?? 0);
    const a = leaky(p);
    pre.push(p);
    act.push(a);
    out += (net.ow[j] ?? 0) * a;
  }
  return { out: clean(out), pre, act };
}

export function guess(net: Net, x: number, y: number): number {
  return forward(net, x, y).out >= 0 ? 1 : -1;
}

/** Mean squared miss on `seeds`. */
export function loss(net: Net, seeds: readonly Seed[]): number {
  if (seeds.length === 0) return 0;
  let s = 0;
  for (const p of seeds) {
    const d = forward(net, p.x, p.y).out - p.l;
    s += d * d;
  }
  return clean(s / seeds.length);
}

/** How many seeds the net places on the right side. */
export function countRight(net: Net, seeds: readonly Seed[]): number {
  let ok = 0;
  for (const p of seeds) if (guess(net, p.x, p.y) === p.l) ok += 1;
  return ok;
}

/**
 * Gradient of the loss with respect to every weight, by backpropagation:
 * the miss at the output is pushed back through each connection.
 */
export function gradient(net: Net, seeds: readonly Seed[]): Net {
  const n = seeds.length === 0 ? 1 : seeds.length;
  const g = zeroNet(net.hidden);
  for (const p of seeds) {
    const { out, pre, act } = forward(net, p.x, p.y);
    const dOut = (2 * (out - p.l)) / n;
    g.ob += dOut;
    if (net.hidden === 0) {
      g.ow[0] = (g.ow[0] ?? 0) + dOut * p.x;
      g.ow[1] = (g.ow[1] ?? 0) + dOut * p.y;
      continue;
    }
    for (let j = 0; j < net.hidden; j++) {
      g.ow[j] = (g.ow[j] ?? 0) + dOut * (act[j] ?? 0);
      const dPre = dOut * (net.ow[j] ?? 0) * leakyDeriv(pre[j] ?? 0);
      g.hw[j * 2] = (g.hw[j * 2] ?? 0) + dPre * p.x;
      g.hw[j * 2 + 1] = (g.hw[j * 2 + 1] ?? 0) + dPre * p.y;
      g.hb[j] = (g.hb[j] ?? 0) + dPre;
    }
  }
  return g;
}

/** One gradient-descent step: every weight moves against its gradient, scaled by the learning rate. */
export function descend(net: Net, grad: Net, lr: number): Net {
  const move = (w: number, g: number) => clamp(clean(w - lr * g), -WEIGHT_CAP, WEIGHT_CAP);
  return {
    hidden: net.hidden,
    hw: net.hw.map((w, i) => move(w, grad.hw[i] ?? 0)),
    hb: net.hb.map((w, i) => move(w, grad.hb[i] ?? 0)),
    ow: net.ow.map((w, i) => move(w, grad.ow[i] ?? 0)),
    ob: move(net.ob, grad.ob),
  };
}

/** `times` gradient-descent steps on the training seeds. */
export function train(net: Net, seeds: readonly Seed[], lr: number, times: number): Net {
  const mine = seeds.filter((s) => s.t === 1);
  let cur = net;
  for (let i = 0; i < times; i++) cur = descend(cur, gradient(cur, mine), lr);
  return cur;
}

/** The weights as one flat list (the order `setParam` uses): hidden weights, hidden biases, output weights, output bias. */
export function params(net: Net): number[] {
  return [...net.hw, ...net.hb, ...net.ow, net.ob];
}

export function paramCount(net: Net): number {
  return net.hw.length + net.hb.length + net.ow.length + 1;
}

/** A copy of `net` with the weight at flat `slot` set to `value`. */
export function setParam(net: Net, slot: number, value: number): Net {
  const next = cloneNet(net);
  let i = slot;
  if (i < next.hw.length) next.hw[i] = value;
  else if ((i -= next.hw.length) < next.hb.length) next.hb[i] = value;
  else if ((i -= next.hb.length) < next.ow.length) next.ow[i] = value;
  else next.ob = value;
  return next;
}

/** Grow by one hidden neuron (0 becomes 2). The new neuron starts small so it does not wreck what was learned. */
export function growNet(net: Net, rng: () => number): Net {
  if (net.hidden === 0) return randomNet(rng, 2);
  const u = (s: number) => round4((rng() * 2 - 1) * s);
  return {
    hidden: net.hidden + 1,
    hw: [...net.hw, u(2), u(2)],
    hb: [...net.hb, u(0.3)],
    ow: [...net.ow, u(0.3)],
    ob: net.ob,
  };
}

/** Shrink by one hidden neuron (2 becomes a single neuron). */
export function shrinkNet(net: Net, rng: () => number): Net {
  if (net.hidden === 0) return net;
  if (net.hidden <= 2) return randomNet(rng, 0);
  const h = net.hidden - 1;
  return { hidden: h, hw: net.hw.slice(0, h * 2), hb: net.hb.slice(0, h), ow: net.ow.slice(0, h), ob: net.ob };
}
