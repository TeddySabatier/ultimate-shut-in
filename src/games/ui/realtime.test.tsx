/**
 * Real-time plumbing: useFixedStep ticks at a fixed rate from
 * requestAnimationFrame, pauses on a hidden tab without a catch-up burst,
 * stops on unmount; useCanvas sizes the backing store by the pixel ratio.
 * Driven through RealtimeExample, the runnable CONTRACT.md example.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parties, runs } from '../testing/fixtures';
import { playToEnd } from '../testing/play';
import { RealtimeExample } from './RealtimeExample';
import { DOT_TICKS, dotEngine } from './RealtimeExample.engine';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function progress(): number {
  return Number(/(\d+)%/.exec(screen.getByRole('img').getAttribute('aria-label') ?? '')?.[1]);
}

const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 50 } as DOMRect);
  vi.stubGlobal('devicePixelRatio', 2);
});

afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const props = () => ({ party: parties.full, seed: 1, run: runs.plain, locale: 'en' as const, reducedMotion: false, onFinish: vi.fn(), onExit: vi.fn() });

describe('real-time games', () => {
  it('ticks once per 50 ms of animation frames and finishes once', () => {
    const p = props();
    render(<RealtimeExample {...p} />);
    act(() => vi.advanceTimersByTime(1000));
    // 20 ticks per second; the first frame only sets the clock.
    expect(progress()).toBeGreaterThanOrEqual(Math.floor((18 / DOT_TICKS) * 100));
    expect(progress()).toBeLessThanOrEqual(Math.ceil((20 / DOT_TICKS) * 100));
    act(() => vi.advanceTimersByTime(3000));
    expect(progress()).toBe(100);
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'won' });
  });

  it('pauses on a hidden tab and resumes without a catch-up burst', () => {
    render(<RealtimeExample {...props()} />);
    act(() => vi.advanceTimersByTime(500));
    const before = progress();
    act(() => setHidden(true));
    act(() => vi.advanceTimersByTime(2000));
    expect(progress()).toBe(before);
    act(() => setHidden(false));
    act(() => vi.advanceTimersByTime(100));
    expect(progress() - before).toBeLessThanOrEqual(Math.ceil((2 / DOT_TICKS) * 100) + 1);
  });

  it('stops the frame loop on unmount', () => {
    const { unmount } = render(<RealtimeExample {...props()} />);
    act(() => vi.advanceTimersByTime(200));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sizes the canvas backing store by the device pixel ratio and draws in CSS pixels', () => {
    render(<RealtimeExample {...props()} />);
    const canvas = screen.getByRole('img') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([400, 100]);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('the example engine passes a headless play', () => {
    const r = playToEnd({ manifest: {} as never, engine: dotEngine, strings: { en: {}, fr: {} } }, 1, parties.single, runs.plain);
    expect(r.steps).toBe(DOT_TICKS);
    expect(r.outcome?.result).toBe('won');
  });
});
