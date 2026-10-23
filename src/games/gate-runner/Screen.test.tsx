/**
 * The Screen plays the engine's game: it mounts, the keys and buttons pick a side, Pause stops the
 * clock, Give up ends as fled, Leave calls onExit, the clock runs the same game at any frame rate,
 * and the text is in the player's language.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import HavenRushScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.starter, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

const step = () => Number(screen.getByTestId('gr-root').getAttribute('data-step'));

/** A manual animation-frame clock: `drive(ms, fps)` advances virtual time in frames of 1000 / fps ms. */
let queue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 1;
let now = 0;
function drive(ms: number, fps: number): void {
  const dt = 1000 / fps;
  const end = now + ms;
  while (now < end) {
    now += dt;
    const run = queue;
    queue = [];
    act(() => run.forEach((f) => f.cb(now)));
  }
}

beforeEach(() => {
  queue = [];
  now = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push({ id: nextId, cb });
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Haven Rush screen', () => {
  it('renders the squad, the boss bar, the canvas with a text alternative and the controls', () => {
    render(<HavenRushScreen {...props()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Haven Rush');
    expect(screen.getByTestId('gr-squad')).toHaveTextContent('Squad 8');
    expect(screen.getByRole('progressbar', { name: 'Boss' })).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(/Squad of 8\. Next gates/);
    for (const name of ['Left', 'Right', 'Pause', 'Slow lane', 'Give up', 'Leave']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByTestId('gr-feed')).toHaveAttribute('aria-live', 'polite');
  });

  it('writes French when the locale is fr', () => {
    render(<HavenRushScreen {...props({ locale: 'fr' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ruée du Haven');
    expect(screen.getByTestId('gr-squad')).toHaveTextContent('Escouade 8');
    for (const name of ['Gauche', 'Droite', 'Abandonner', 'Quitter', 'Voie lente']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('the arrow keys, A and D and the side buttons pick a side', () => {
    render(<HavenRushScreen {...props()} />);
    const left = screen.getByRole('button', { name: 'Left' });
    const right = screen.getByRole('button', { name: 'Right' });
    expect(right).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(left).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'd' });
    expect(right).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'A' });
    expect(left).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(right);
    expect(right).toHaveAttribute('aria-pressed', 'true');
  });

  it('keys are ignored while typing in a field', () => {
    render(
      <>
        <input aria-label="name" />
        <HavenRushScreen {...props()} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('name'), { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a pointer on the left half of the lane picks the left, on the right half the right', () => {
    render(<HavenRushScreen {...props()} />);
    const canvas = screen.getByTestId('gr-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 50 });
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 50, buttons: 1 });
    expect(screen.getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 50, buttons: 0 });
    expect(screen.getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('runs one tick per 50 ms and the same game at 30, 60 and 144 frames per second', () => {
    const steps: number[] = [];
    for (const fps of [30, 60, 144]) {
      queue = [];
      now = 1000;
      const { unmount } = render(<HavenRushScreen {...props()} />);
      drive(5000, fps);
      steps.push(step());
      unmount();
    }
    expect(steps[0]).toBeGreaterThanOrEqual(99);
    expect(steps[0]).toBeLessThanOrEqual(101);
    expect(Math.abs(steps[1]! - steps[0]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(steps[2]! - steps[0]!)).toBeLessThanOrEqual(1);
  });

  it('Pause stops the clock without changing the game; P and Space toggle it', () => {
    render(<HavenRushScreen {...props()} />);
    drive(1000, 60);
    const before = step();
    expect(before).toBeGreaterThan(10);
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('gr-feed')).toHaveTextContent('Paused.');
    drive(2000, 60);
    expect(step()).toBe(before);
    fireEvent.keyDown(document.body, { key: ' ' });
    drive(1000, 60);
    expect(step()).toBeGreaterThan(before);
  });

  it('does not run while the tab is hidden', () => {
    render(<HavenRushScreen {...props()} />);
    drive(500, 60);
    const before = step();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    drive(2000, 60);
    expect(step()).toBe(before);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('Give up ends as fled, Leave calls onExit once', () => {
    const p = props();
    render(<HavenRushScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Give up' }));
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled' });
    expect(screen.getByRole('status')).toHaveTextContent(/step back/i);
    expect((vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome).durationMs).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(p.onFinish)).toHaveBeenCalledTimes(1);
    expect(p.onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('a played game ends once with an outcome, whatever the frame rate', () => {
    const p = props({ run: { buffs: [], roomIndex: 0, difficulty: 1 } });
    render(<HavenRushScreen {...p} />);
    drive(90_000, 30);
    expect(vi.mocked(p.onFinish)).toHaveBeenCalledTimes(1);
    expect(['won', 'lost']).toContain((vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome).result);
  });

  it('Study vassals see the coming gates, Eat vassals their shield, and Hint buffs their arrow text', () => {
    render(<HavenRushScreen {...props({ party: parties.full, run: { buffs: [{ id: 'h', kind: 'hint', amount: 2 }], roomIndex: 0, difficulty: 2 } })} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Coming gates' })).toBeInTheDocument();
    expect(screen.getByText(/Shield 5/)).toBeInTheDocument();
    expect(screen.getByText(/Hint: the (left|right) gate/)).toBeInTheDocument();
  });
});
