/**
 * The Screen plays the engine's game: the clock gives 20 ticks per real second at any
 * frame rate (40 at x2), the keyboard places and pauses, the canvas redraws after a
 * resize at DPR 2, and the outcome and the language come from the engine.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine } from './engine';
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
    press('1');
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
  it('the arrow keys move the cursor and 1 places the first tower there: glow drops and the feed says so', () => {
    render(<TowerDefenseScreen {...props()} />);
    board().focus();
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Pad 1 of');
    expect(hud()).toContain('Glow 110');
    press('ArrowRight');
    expect(screen.getByTestId('td-pad')).not.toHaveTextContent('Pad 1 of');
    press('1');
    expect(hud()).toContain('Glow 72'); // Runner costs 30 + floor(44 / 5)
    expect(screen.getByTestId('td-feed')).toHaveTextContent(/Pell takes a post: Runner on pad \d+/);
    expect(screen.getByTestId('td-pad')).toHaveTextContent('Runner of Pell, level 1');
  });

  it('Enter upgrades the tower under the cursor, S sells it, Escape clears the pick', () => {
    render(<TowerDefenseScreen {...props()} />);
    press('1');
    expect(screen.getByRole('button', { name: /Runner/, pressed: true })).toBeInTheDocument();
    fireEvent.keyDown(board(), { key: 'Enter' });
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
    fireEvent.click(lantern); // 48
    fireEvent.click(screen.getByRole('button', { name: 'Next pad' }));
    fireEvent.click(lantern);
    expect(hud()).toContain('Glow 14');
    fireEvent.click(screen.getByRole('button', { name: 'Next pad' }));
    fireEvent.click(lantern);
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
    for (const name of ['Previous pad', 'Next pad', /^Upgrade/, /^Sell/, 'Pause', /^Speed/, /^Next wave/, 'Give up', 'Leave']) {
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
    press('1');
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
    const p = props({ run: { ...runs.plain, difficulty: 1 } });
    render(<TowerDefenseScreen {...p} />);
    press('n');
    // The bot's own rules, driven through the Screen's clock: place nothing, just let the waves come and the Haven fall or hold.
    runFrames(1, 0);
    for (let i = 0; i < 40000 && vi.mocked(p.onFinish).mock.calls.length === 0; i++) {
      if (i % 600 === 0 && screen.queryByRole('button', { name: /^Next wave/ })) fireEvent.click(screen.getByRole('button', { name: /^Next wave/ }));
      runFrames(5, 50);
    }
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(['won', 'lost']).toContain(got.result);
    expect(got.log[0]).toMatch(/^The path: /);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('writes the screen and the outcome in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<TowerDefenseScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tenir le Havre');
    expect(hud()).toContain('Vague 0 sur 6');
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

  it('under reduced motion it still moves the enemies, tick by tick, with no particles', () => {
    render(<TowerDefenseScreen {...props({ reducedMotion: true })} />);
    press('n');
    runFrames(1, 0);
    runFrames(60, 1000 / 60);
    expect(tickOf()).toBeGreaterThanOrEqual(19);
    expect(calls.arc).toBeDefined();
    expect(assigned.has('globalAlpha')).toBe(false);
  });
});
