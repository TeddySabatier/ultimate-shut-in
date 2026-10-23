/**
 * The Screen plays the engine's game: the clock gives 20 ticks per real second at any
 * frame rate (40 at x2), the keyboard places and pauses, the canvas redraws after a
 * resize at DPR 2, and the outcome and the language come from the engine.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome, RunContext } from '../contract';
import { parties, runs } from '../testing/contract';
import { bestPad, engine, pointInto, type TDState } from './engine';
import TowerDefenseScreen from './Screen';

// ---- a hand-driven requestAnimationFrame: frames arrive when the test says ----
let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextId = 1;
let now = 0;

function runFrames(count: number, dtMs: number): void {
  for (let i = 0; i < count; i++) {
    now += dtMs;
    const due = queue;
    queue = [];
    act(() => {
      for (const f of due) f.cb(now);
    });
  }
}

const calls: Record<string, ReturnType<typeof vi.fn>> = {};
const assigned = new Set<string>();
/** A 2D context that accepts every call and remembers which ones were made and which properties were set. */
function makeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, key: string) {
      if (!(key in t)) t[key] = calls[key] = vi.fn();
      return t[key];
    },
    set(t, key: string, value) {
      assigned.add(key);
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
let rect = { width: 270, height: 210 };

beforeEach(() => {
  queue = [];
  nextId = 1;
  now = 0;
  for (const k of Object.keys(calls)) delete calls[k];
  assigned.clear();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push({ id: nextId, cb });
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  });
  vi.stubGlobal('devicePixelRatio', 2);
  rect = { width: 270, height: 210 };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtx());
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ ...rect, x: 0, y: 0, top: 0, left: 0, right: rect.width, bottom: rect.height, toJSON: () => ({}) }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: false, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

const tickOf = () => Number(screen.getByTestId('td-root').getAttribute('data-tick'));
const hud = () => screen.getByTestId('td-hud').textContent ?? '';
const board = () => screen.getByTestId('td-board');
const press = (key: string) => fireEvent.keyDown(board(), { key });
/** Pick the n-th card, then build it on the pad under the cursor (Enter on the board). */
const build = (n: number) => {
  press(String(n));
  press('Enter');
};
const tapPad = (pad: number) => {
  const c = engine.initial(42, parties.full, runs.plain, 'en').pads[pad]!;
  fireEvent.pointerDown(board(), { clientX: (c % 9) * 30 + 15, clientY: Math.floor(c / 9) * 30 + 15 }); // 270 x 210 board: cells of 30 px
};

describe('Hold the Haven screen: the clock', () => {
  it.each([60, 30])('runs 20 ticks per real second at %i frames per second', (fps) => {
    render(<TowerDefenseScreen {...props()} />);
    runFrames(1, 0); // the first frame only sets the clock
    runFrames(fps, 1000 / fps);
    expect(tickOf()).toBeGreaterThanOrEqual(19);
    expect(tickOf()).toBeLessThanOrEqual(20);
    runFrames(fps, 1000 / fps);
    expect(tickOf()).toBeGreaterThanOrEqual(39);
    expect(tickOf()).toBeLessThanOrEqual(40);
  });

  it('runs 40 ticks per real second at x2, set by the X key or the Speed button', () => {
    render(<TowerDefenseScreen {...props()} />);
    press('x');
    expect(screen.getByRole('button', { name: 'Speed x2' })).toBeInTheDocument();
    runFrames(1, 0);
    runFrames(60, 1000 / 60);
    expect(tickOf()).toBeGreaterThanOrEqual(38);
    expect(tickOf()).toBeLessThanOrEqual(40);
    fireEvent.click(screen.getByRole('button', { name: 'Speed x2' }));
    expect(screen.getByRole('button', { name: 'Speed x1' })).toBeInTheDocument();
  });

  it('P pauses: the Pause button is pressed, the ticks stop, the HUD freezes; building still works; P resumes', () => {
    render(<TowerDefenseScreen {...props()} />);
    runFrames(1, 0);
    runFrames(60, 1000 / 60);
    const pause = screen.getByRole('button', { name: 'Pause' });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    press('p');
    expect(pause).toHaveAttribute('aria-pressed', 'true');
    const frozen = tickOf();
    const text = hud();
    runFrames(120, 1000 / 60);
    expect(tickOf()).toBe(frozen);
    expect(hud()).toBe(text);
    build(1);
    expect(hud()).toContain('Glow 72'); // placed while paused
    expect(tickOf()).toBe(frozen);
    press('p');
    runFrames(1, 0);
    runFrames(30, 1000 / 60);
    expect(tickOf()).toBeGreaterThan(frozen);
  });

  it('stops every frame request when it unmounts', () => {
    const { unmount } = render(<TowerDefenseScreen {...props()} />);
    runFrames(3, 16);
    unmount();
    expect(queue).toHaveLength(0);
  });
});

describe('Hold the Haven screen: playing', () => {
  it('the arrow keys move the cursor, 1 picks the first tower and Enter builds it there: glow drops and the feed says so', () => {
    render(<TowerDefenseScreen {...props()} />);
    board().focus();
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Pad 1 of');
    expect(hud()).toContain('Glow 110');
    press('ArrowRight');
    expect(screen.getByTestId('td-pad')).not.toHaveTextContent('Pad 1 of');
    press('1');
    expect(hud()).toContain('Glow 110'); // the number key only picks
    expect(screen.getByTestId('td-feed')).toHaveTextContent('Runner picked. Tap a free pad');
    press('Enter');
    expect(hud()).toContain('Glow 72'); // Runner costs 30 + floor(44 / 5)
    expect(screen.getByTestId('td-feed')).toHaveTextContent(/Pell takes a post: Runner on pad \d+/);
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Runner of Pell, level 1');
  });

  it('Enter upgrades the tower under the cursor, S sells it, Escape clears the pick', () => {
    render(<TowerDefenseScreen {...props()} />);
    press('1');
    expect(screen.getByRole('button', { name: /Runner/, pressed: true })).toBeInTheDocument();
    press('Enter'); // builds on the free pad ...
    expect(hud()).toContain('Glow 72');
    press('Enter'); // ... and upgrades it on the next press
    expect(hud()).toContain('Glow 34'); // 110 - 38 - 38
    expect(screen.getByTestId('td-pad')).toHaveTextContent('level 2');
    press('s');
    expect(hud()).toContain(`Glow ${34 + Math.floor((76 * 70) / 100)}`);
    expect(screen.getByTestId('td-feed')).toHaveTextContent('steps down from pad');
    press('Escape');
    expect(screen.getByRole('button', { name: /Runner/, pressed: false })).toBeInTheDocument();
    press('s');
    expect(screen.getByTestId('td-feed')).toHaveTextContent('Nothing to upgrade or sell here.');
  });

  it('a card that costs too much is dimmed, not disabled, and the feed says why', () => {
    render(<TowerDefenseScreen {...props()} />);
    const lantern = screen.getByRole('button', { name: /Lantern/ });
    const buildHere = () => fireEvent.click(screen.getByRole('button', { name: /^Build/ }));
    fireEvent.click(lantern); // 48
    buildHere();
    fireEvent.click(screen.getByRole('button', { name: 'Next pad' }));
    fireEvent.click(lantern);
    buildHere();
    expect(hud()).toContain('Glow 14');
    fireEvent.click(screen.getByRole('button', { name: 'Next pad' }));
    fireEvent.click(lantern);
    buildHere();
    expect(lantern).not.toBeDisabled();
    expect(lantern).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('td-feed')).toHaveTextContent('Not enough glow: Lantern costs 48, you have 14.');
    expect(hud()).toContain('Glow 14');
  });

  it('ignores shortcuts typed in a text field', () => {
    render(<TowerDefenseScreen {...props()} />);
    const input = document.createElement('input');
    screen.getByTestId('td-root').appendChild(input);
    fireEvent.keyDown(input, { key: '1' });
    fireEvent.keyDown(input, { key: 'p' });
    expect(hud()).toContain('Glow 110');
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('N calls the next wave for a bonus; with nothing to call it says so', () => {
    render(<TowerDefenseScreen {...props()} />);
    expect(screen.getByRole('button', { name: 'Next wave (+34)' })).toBeInTheDocument();
    press('n');
    expect(hud()).toContain('Wave 1 of 6');
    expect(hud()).toContain('Glow 144');
    press('n');
    expect(screen.getByTestId('td-feed')).toHaveTextContent('The wave is still arriving.');
  });

  it('a tap on a free pad builds the picked tower there, and the pick is used up', () => {
    render(<TowerDefenseScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Lantern/ }));
    expect(hud()).toContain('Glow 110'); // the card alone builds nothing
    tapPad(3);
    expect(hud()).toContain('Glow 62');
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Pad 4 of');
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Lantern of Wren, level 1');
    expect(screen.getByRole('button', { name: /Lantern/, pressed: false })).toBeInTheDocument();
    tapPad(5); // nothing picked: the tap only moves the cursor
    expect(hud()).toContain('Glow 62');
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Pad 6 of');
  });

  it('a tap on a built pad never builds: it only moves the cursor to it', () => {
    render(<TowerDefenseScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Lantern/ }));
    tapPad(3);
    fireEvent.click(screen.getByRole('button', { name: /Runner/ }));
    tapPad(3);
    expect(hud()).toContain('Glow 62');
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Lantern of Wren');
    expect(screen.getByRole('button', { name: /Runner/, pressed: true })).toBeInTheDocument();
  });

  it('tapping a pad on the board moves the cursor', () => {
    render(<TowerDefenseScreen {...props()} />);
    const s = engine.initial(42, parties.full, runs.plain, 'en');
    const cellPx = 30; // 270 wide board: 9 cells of 30 px, 210 high: 7 cells
    const pad = 3;
    const c = s.pads[pad]!;
    fireEvent.pointerDown(board(), { clientX: (c % 9) * cellPx + 15, clientY: Math.floor(c / 9) * cellPx + 15 });
    expect(screen.getByTestId('td-pad')).toHaveTextContent(`Pad ${pad + 1} of`);
  });

  it('every control is a labelled button', () => {
    render(<TowerDefenseScreen {...props()} />);
    for (const name of ['Previous pad', 'Next pad', /^Build/, /^Sell/, 'Pause', /^Speed/, /^Next wave/, 'Give up', 'Leave']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: /^\d\s?[A-Z]/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hold the Haven');
  });
});

describe('Hold the Haven screen: the end', () => {
  it('Give up ends as fled once, keeps the board, and Leave calls onExit', () => {
    const p = props();
    render(<TowerDefenseScreen {...p} />);
    build(1);
    fireEvent.click(screen.getByRole('button', { name: 'Give up' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled', troopsUsed: ['move'] });
    expect(screen.getByRole('status')).toHaveTextContent('The troops head home');
    expect(screen.queryByRole('button', { name: 'Give up' })).toBeNull();
    expect(board()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('plays a whole game to the outcome the engine computes for the same actions', () => {
    const run: RunContext = { ...runs.plain, difficulty: 1 };
    const p = props({ run });
    render(<TowerDefenseScreen {...p} />);
    press('n'); // the only action: call the first wave, then let the clock run with nothing built
    runFrames(1, 0);
    // A frame of 250 ms is five ticks (the clock's catch-up limit), so a long game takes a fifth of the frames.
    for (let i = 0; i < 6000 && vi.mocked(p.onFinish).mock.calls.length === 0; i++) runFrames(1, 250);
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    // The same actions through the engine alone: a callWave, then ticks until it ends.
    let s: TDState = engine.reduce(engine.initial(42, parties.full, run, 'en'), { type: 'callWave' });
    while (s.result === null) s = engine.reduce(s, { type: 'tick' });
    expect({ ...got, durationMs: undefined }).toEqual({ ...engine.outcome(s)!, durationMs: undefined });
    expect(got.result).toBe('lost');
    expect(screen.getByRole('status')).toHaveTextContent('The troops come home');
  });

  it('writes the screen and the outcome in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<TowerDefenseScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tenir le Havre');
    expect(hud()).toContain('Prépare-toi : 6 vagues');
    expect(hud()).toContain('Éclat 110');
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/^Le chemin : /);
  });
});

describe('Hold the Haven screen: the canvas', () => {
  it('sizes the backing store by the pixel ratio, draws in CSS pixels, and draws again after a resize', () => {
    render(<TowerDefenseScreen {...props()} />);
    const canvas = screen.getByRole('img') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([540, 420]);
    expect(calls.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(calls.fillRect).toHaveBeenCalled();
    calls.clearRect!.mockClear();
    calls.setTransform!.mockClear();
    rect = { width: 360, height: 280 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect([canvas.width, canvas.height]).toEqual([720, 560]);
    expect(calls.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(calls.clearRect).toHaveBeenCalledWith(0, 0, 360, 280);
  });

  it('describes the board and the keys to assistive technology', () => {
    render(<TowerDefenseScreen {...props()} />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Pad 1 of');
    expect(label).toContain('1 to 8 pick a tower');
    expect(screen.getByTestId('td-feed')).toHaveAttribute('aria-live', 'polite');
  });

  /** The last canvas arc of a clutter blob (radius 6 on this 30 px cell board), in CSS pixels. */
  const blobAt = () => {
    const hits = calls.arc!.mock.calls.filter((c) => c[2] === 6);
    const last = hits[hits.length - 1] as number[];
    return { x: last[0]!, y: last[1]! };
  };

  it('draws the monsters at the tick itself under reduced motion, and between two ticks otherwise', () => {
    const expected = (ticks: number) => {
      let st = engine.reduce(engine.initial(42, parties.full, runs.plain, 'en'), { type: 'callWave' });
      for (let i = 0; i < ticks; i++) st = engine.reduce(st, { type: 'tick' });
      return st;
    };
    const px = (st: TDState, pos: number) => {
      const pt = { x: 0, y: 0 };
      pointInto(st.path, pos, pt);
      return { x: (pt.x * 30) / 1000, y: (pt.y * 30) / 1000 };
    };
    const atTick2 = expected(2);
    const pos2 = atTick2.enemies[0]!.pos;
    const pos1 = expected(1).enemies[0]!.pos;
    expect(pos2).toBeGreaterThan(pos1);

    // Reduced motion: two ticks have run, a frame in the middle of the third interval, and the blob is still at tick 2.
    const { unmount } = render(<TowerDefenseScreen {...props({ reducedMotion: true })} />);
    press('n');
    runFrames(1, 0);
    runFrames(5, 25);
    expect(tickOf()).toBe(2);
    expect(blobAt()).toEqual(px(atTick2, pos2));
    expect(assigned.has('globalAlpha')).toBe(false);
    unmount();

    // Motion allowed: the same frame draws halfway between tick 1 and tick 2 (not at either).
    queue = [];
    now = 0;
    for (const f of Object.values(calls)) f.mockClear();
    render(<TowerDefenseScreen {...props({ reducedMotion: false })} />);
    press('n');
    runFrames(1, 0);
    runFrames(5, 25);
    expect(tickOf()).toBe(2);
    const mid = blobAt();
    const half = px(atTick2, Math.floor((pos1 + pos2) / 2));
    expect(Math.abs(mid.x - half.x) + Math.abs(mid.y - half.y)).toBeLessThan(0.5);
    expect(mid).not.toEqual(px(atTick2, pos2));
  });
});

describe('Hold the Haven screen: the hint buff', () => {
  const hintRun: RunContext = { buffs: [{ id: 'h', kind: 'hint', amount: 2 }], roomIndex: 0, difficulty: 2 };
  const lanternBest = bestPad(engine.initial(42, parties.full, hintRun, 'en'), 'outside')! + 1;

  it('a first tap shows the best pad and places nothing: the cursor moves, the star is announced in text, no hint is spent', () => {
    render(<TowerDefenseScreen {...props({ run: hintRun })} />);
    expect(hud()).toContain('Hints 2');
    press('2'); // Lantern
    expect(hud()).toContain('Glow 110');
    expect(hud()).toContain('Hints 2');
    expect(screen.getByTestId('td-pad')).toHaveTextContent(`Pad ${lanternBest} of`);
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Best spot for this tower');
    expect(screen.getByTestId('td-feed')).toHaveTextContent(`Best pad for Lantern: pad ${lanternBest}.`);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain(`Best pad for Lantern: pad ${lanternBest}.`);
    expect(screen.getByTestId('td-info')).toHaveTextContent('Lantern: Long reach, slow, ignores armour.');
  });

  it('a second tap (or Enter) places it on the star and spends the hint; a pad that was not starred spends none', () => {
    render(<TowerDefenseScreen {...props({ run: hintRun })} />);
    press('2');
    press('Enter'); // place on the shown star
    expect(hud()).toContain('Glow 62');
    expect(hud()).toContain('Hints 1');
    press('1'); // Runner: shows its own star, places nothing
    expect(hud()).toContain('Glow 62');
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Best spot for this tower');
    // Walk off the star onto another free pad and place with Enter: no hint is spent there.
    for (let i = 0; i < 12 && /Best spot|level/.test(screen.getByTestId('td-pad').textContent ?? ''); i++) fireEvent.click(screen.getByRole('button', { name: 'Next pad' }));
    expect(screen.getByTestId('td-pad')).toHaveTextContent('free');
    fireEvent.keyDown(board(), { key: 'Enter' });
    expect(hud()).toContain('Glow 24');
    expect(hud()).toContain('Hints 1');
  });

  it('with no hint left a card tap only picks, and the cursor stays where it is', () => {
    render(<TowerDefenseScreen {...props()} />);
    expect(hud()).not.toContain('Hints');
    press('2');
    expect(hud()).toContain('Glow 110');
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Pad 1 of');
    press('Enter');
    expect(hud()).toContain('Glow 62');
  });
});

describe('Hold the Haven screen: focus and text', () => {
  it('moves focus to the result line when the game ends and its buttons go away', () => {
    render(<TowerDefenseScreen {...props()} />);
    const giveUp = screen.getByRole('button', { name: 'Give up' });
    giveUp.focus();
    fireEvent.click(giveUp);
    expect(screen.getByRole('status')).toHaveFocus();
  });

  it('says in plain words when nothing can be upgraded or sold, and describes the picked tower', () => {
    render(<TowerDefenseScreen {...props()} />);
    expect(screen.getByRole('button', { name: 'Build' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument();
    press('3');
    expect(screen.getByRole('button', { name: /^Build \(\d+\)/ })).toBeInTheDocument();
    expect(screen.getByTestId('td-info')).toHaveTextContent('Sweeper: Hits everything close by.');
    press('Enter');
    expect(screen.getByRole('button', { name: /^Sell \(\+/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Upgrade \(/ })).toBeInTheDocument();
  });

  it('keeps the French spacing before a colon in the pad line', () => {
    render(<TowerDefenseScreen {...props({ locale: 'fr' })} />);
    expect(screen.getByTestId('td-pad').textContent).toMatch(/Emplacement 1 sur \d+ : libre/);
  });

  it('orders the feed by what happened: a note follows the engine line it came after', () => {
    render(<TowerDefenseScreen {...props()} />);
    build(1); // places: an engine line
    press('Escape'); // a note
    const texts = Array.from(screen.getByTestId('td-feed').querySelectorAll('li')).map((li) => li.textContent);
    expect(texts[texts.length - 2]).toMatch(/takes a post/);
    expect(texts[texts.length - 1]).toBe('Pick cleared.');
  });
});

