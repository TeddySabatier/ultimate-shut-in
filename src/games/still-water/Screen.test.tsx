/**
 * The Screen plays the engine: Begin starts the clock, Space and the button
 * hold, Pause stops it, Step away ends as fled, Leave calls onExit once,
 * reduced motion shows the bar and the same text cue, French follows the
 * locale, and the optional modes (tap each phase, pulse) stay off by default.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRun, makeMember, type GameScreenProps, type Outcome, type Party } from '../contract';
import { parties, runs } from '../testing/contract';
import { LEAD_TICKS, engine } from './engine';
import StillWaterScreen from './Screen';

const noMove: Party = { members: [makeMember({ id: 'study', name: 'Sage', habit: 'study', level: 1, loyalty: 50 })] };

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return {
    party: parties.full,
    seed: 42,
    run: runs.plain,
    locale: 'en',
    reducedMotion: false,
    onFinish: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'vibrate');
});

/** Let `ms` of game time go by (the fake rAF clock). */
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const begin = () => fireEvent.click(screen.getByTestId('still-water-begin'));
const hold = () => screen.getByTestId('still-water-hold');
/** The rhythm line with its non-breaking spaces as plain ones. */
const rhythm = () => (screen.getByTestId('still-water-rhythm').textContent ?? '').replace(/\u00a0/g, ' ');

describe('Still Water screen: before the start', () => {
  it('shows the not-therapy note, the rhythm, the party perks and a Begin button', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Still Water');
    expect(screen.getByTestId('still-water-disclaimer')).toHaveTextContent(/not therapy/i);
    expect(rhythm()).toBe('In 4 s · hold 2 s · out 6 s');
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Get ready');
    expect(screen.getByText(/Rest helps/)).toBeInTheDocument();
    expect(screen.getByText(/gentle line/)).toBeInTheDocument();
    expect(screen.queryByTestId('still-water-hold')).toBeNull();
    expect(screen.getByTestId('still-water-begin')).toHaveTextContent('Begin');
  });

  it('does not run before Begin', () => {
    render(<StillWaterScreen {...props()} />);
    wait(5000);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Get ready');
    expect(screen.getByTestId('still-water-cycle')).toHaveTextContent('Cycle 1 of 6');
  });

  it('a Move troop offers the pace and it changes the rhythm; without Move there is no choice', () => {
    const { unmount } = render(<StillWaterScreen {...props({ party: parties.starter, run: emptyRun(1) })} />);
    const group = screen.getByRole('group', { name: 'How fast the pond breathes' });
    expect(group).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Slow' }));
    expect(rhythm()).toBe('In 5 s · hold 2.5 s · out 7.5 s');
    expect(screen.getByRole('button', { name: 'Slow' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Brisk' }));
    expect(rhythm()).toBe('In 3.2 s · hold 1.6 s · out 4.8 s');
    unmount();
    render(<StillWaterScreen {...props({ party: noMove })} />);
    expect(screen.queryByRole('group', { name: 'How fast the pond breathes' })).toBeNull();
  });

  it('the pace choice is gone once the game has begun', () => {
    render(<StillWaterScreen {...props({ party: parties.starter })} />);
    begin();
    expect(screen.queryByRole('button', { name: 'Slow' })).toBeNull();
    expect(screen.getByTestId('still-water-hold')).toBeInTheDocument();
  });
});

describe('Still Water screen: playing', () => {
  it('after Begin the cue goes from Get ready to Breathe in, then Hold, then Breathe out', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Get ready');
    wait(LEAD_TICKS * 50 + 200);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Breathe in');
    wait(4000);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Hold');
    wait(2000);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Breathe out');
  });

  it('Space and Enter hold while pressed; the button reports it', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(window, { key: ' ' });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyUp(window, { key: ' ' });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyUp(window, { key: 'Enter' });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('Space on a focused control presses that control, not the breath', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    const pause = screen.getByRole('button', { name: 'Pause' });
    pause.focus();
    fireEvent.keyDown(pause, { key: ' ' });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('losing the window while a key is down lets go', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    fireEvent.keyDown(window, { key: ' ' });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.blur(window);
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('pressing and releasing the big button holds and lets go', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    fireEvent.pointerDown(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerUp(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('Tap each phase: a press in the breath in holds, a press in the breath out releases', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    fireEvent.click(screen.getByRole('button', { name: 'Tap each phase' }));
    expect(screen.getByRole('button', { name: 'Tap at each phase' })).toBeInTheDocument();
    wait(LEAD_TICKS * 50 + 200);
    fireEvent.pointerDown(hold(), { pointerId: 1 });
    fireEvent.pointerUp(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    wait(6000);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Breathe out');
    fireEvent.pointerDown(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('Tap each phase: a tap a little before the breath out already lets go', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1), party: noMove })} />);
    begin();
    fireEvent.click(screen.getByRole('button', { name: 'Tap each phase' }));
    wait(LEAD_TICKS * 50 + 200);
    fireEvent.pointerDown(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    wait(5400);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Hold');
    fireEvent.pointerDown(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('turning Tap each phase off while holding lets go', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    const toggle = screen.getByRole('button', { name: 'Tap each phase' });
    fireEvent.click(toggle);
    wait(LEAD_TICKS * 50 + 200);
    fireEvent.pointerDown(hold(), { pointerId: 1 });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
  });

  it('holding shows in words and a shape as well as in colour', () => {
    render(<StillWaterScreen {...props({ reducedMotion: true })} />);
    begin();
    expect(hold()).toHaveTextContent('○ Let go');
    fireEvent.keyDown(window, { key: ' ' });
    expect(hold()).toHaveTextContent('● Holding');
  });

  it('a hidden tab pauses the game and says so', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    Reflect.deleteProperty(document, 'hidden');
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Paused');
  });

  it('with a hint, the cue also says how long the phase lasts, once per phase, for a screen reader', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    wait(LEAD_TICKS * 50 + 200);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Breathe in, 4 seconds');
  });

  it('Pause stops the clock and the keys; Resume starts them again', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    wait(LEAD_TICKS * 50 + 500);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent(/Paused/);
    fireEvent.keyDown(window, { key: ' ' });
    expect(hold()).toHaveAttribute('aria-pressed', 'false');
    wait(30_000);
    expect(screen.getByTestId('still-water-cycle')).toHaveTextContent('Cycle 1 of 5');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Breathe in');
  });

  it('a ripple shows in its reserved row and tapping it costs calm; it passes by itself otherwise', () => {
    const p = props({ run: emptyRun(1), party: noMove });
    const d = engine.initial(42, p.party, p.run, 'en').decoys[0]!;
    render(<StillWaterScreen {...p} />);
    begin();
    expect(screen.getByTestId('still-water-ripples')).toHaveTextContent('Ripples will pass');
    wait((LEAD_TICKS + d.appearTick + 3) * 50);
    const ripple = screen.getByTestId('still-water-ripples').querySelector('button');
    expect(ripple).not.toBeNull();
    fireEvent.click(ripple!);
    expect(screen.getByTestId('still-water-ripples').querySelector('button')).toBeNull();
    wait((d.leaveTick - d.appearTick + 5) * 50);
    expect(screen.getByText(/Ripples let go: 0 of 1/)).toBeInTheDocument();
  });

  it('shows the hint line with an Eat troop and not without one', () => {
    const { unmount } = render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    wait(LEAD_TICKS * 50 + 300);
    expect(screen.getByTestId('still-water-next')).toHaveTextContent(/In \d+ s: hold/);
    unmount();
    render(<StillWaterScreen {...props({ run: emptyRun(1), party: noMove })} />);
    begin();
    wait(LEAD_TICKS * 50 + 300);
    expect(screen.queryByTestId('still-water-next')).toBeNull();
  });

  it('the pulse option is off by default and only pulses when switched on', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<StillWaterScreen {...props({ run: emptyRun(1) })} />);
    begin();
    const toggle = screen.getByRole('button', { name: 'Pulse on phase change' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    wait((LEAD_TICKS + 90) * 50);
    expect(vibrate).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    wait(2500);
    expect(vibrate).toHaveBeenCalled();
  });

  it('hides the pulse option where the browser cannot vibrate', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    expect(screen.queryByRole('button', { name: 'Pulse on phase change' })).toBeNull();
  });
});

describe('Still Water screen: reduced motion, leaving and the end', () => {
  it('reduced motion replaces the ring with a progress bar and keeps the text cue; it plays the same', () => {
    render(<StillWaterScreen {...props({ reducedMotion: true })} />);
    expect(screen.queryByTestId('still-water-pond')).toBeNull();
    const bar = screen.getByRole('progressbar', { name: 'Breath' });
    expect(bar).toHaveAttribute('aria-valuetext', 'Get ready');
    begin();
    wait((LEAD_TICKS + 20) * 50);
    expect(screen.getByRole('progressbar', { name: 'Breath' })).toHaveAttribute('aria-valuetext', 'Breathe in');
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Breathe in');
    fireEvent.keyDown(window, { key: ' ' });
    expect(hold()).toHaveAttribute('aria-pressed', 'true');
  });

  it('the text cue is a polite live region, the ring is hidden from assistive technology', () => {
    render(<StillWaterScreen {...props()} />);
    expect(screen.getByTestId('still-water-phase')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('still-water-pond')).toHaveAttribute('aria-hidden', 'true');
  });

  it('Step away ends as fled and keeps the board; Leave is a separate press that calls onExit once', () => {
    const p = props();
    render(<StillWaterScreen {...p} />);
    begin();
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(p.onExit).not.toHaveBeenCalled();
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    expect(screen.getByTestId('still-water-banner')).toHaveTextContent('You left the bank');
    expect(screen.queryByRole('button', { name: 'Step away' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
    expect(p.onFinish).toHaveBeenCalledTimes(1);
  });

  it('a game stepped away from while paused says Done, not Paused', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Done');
    expect(screen.getByTestId('still-water-phase')).not.toHaveTextContent('Paused');
  });

  it('a hidden tab does not pause a board that has not begun or has ended', () => {
    const hide = () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      Reflect.deleteProperty(document, 'hidden');
    };
    const { unmount } = render(<StillWaterScreen {...props()} />);
    hide();
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Get ready');
    begin();
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    hide();
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Done');
    unmount();
  });

  it('after Resume and after a toggle the focus goes back to the hold button, so Space holds', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    wait(100);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    wait(100);
    expect(hold()).toHaveFocus();
    const toggle = screen.getByRole('button', { name: 'Tap each phase' });
    toggle.focus();
    fireEvent.click(toggle);
    wait(100);
    expect(hold()).toHaveFocus();
  });

  it('the hint perk says "cycle" for one and "cycles" for more, in both languages', () => {
    const hinted = (amount: number, locale: 'en' | 'fr') =>
      props({ party: noMove, locale, run: { buffs: [{ id: 'h', kind: 'hint', amount }], roomIndex: 0, difficulty: 1 } });
    const { unmount: u1 } = render(<StillWaterScreen {...hinted(1, 'en')} />);
    expect(screen.getByText('A hint lights the first cycle.')).toBeInTheDocument();
    u1();
    const { unmount: u2 } = render(<StillWaterScreen {...hinted(3, 'en')} />);
    expect(screen.getByText('A hint lights the first 3 cycles.')).toBeInTheDocument();
    u2();
    const { unmount: u3 } = render(<StillWaterScreen {...hinted(1, 'fr')} />);
    expect(screen.getByText('Un indice éclaire le premier cycle.')).toBeInTheDocument();
    u3();
    render(<StillWaterScreen {...hinted(2, 'fr')} />);
    expect(screen.getByText('Un indice éclaire les 2 premiers cycles.')).toBeInTheDocument();
  });

  it('French keeps a non-breaking space before the colon and between a number and "s", and a decimal comma in the grace', () => {
    render(<StillWaterScreen {...props({ locale: 'fr', party: parties.starter, run: emptyRun(1) })} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Marge de tempo ±0,4 s');
    expect(text).toContain('Rides laissées passer : 0 sur 1');
    cleanup();
    render(<StillWaterScreen {...props({ locale: 'fr', run: emptyRun(1) })} />);
    expect(screen.getByTestId('still-water-next').textContent).toContain('Dans 2 s : inspire');
  });

  it('after the end the cue says Done, never an instruction to breathe', () => {
    render(<StillWaterScreen {...props({ run: emptyRun(1), party: noMove })} />);
    begin();
    wait((LEAD_TICKS + 5 * 240) * 50 + 1500);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Done');
    expect(screen.getByTestId('still-water-phase')).not.toHaveTextContent(/Breathe/);
  });

  it('when the game ends the focus moves to the result, not to the page', () => {
    render(<StillWaterScreen {...props()} />);
    begin();
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(screen.getByTestId('still-water-banner')).toHaveFocus();
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Done');
  });

  it('plays a whole game with the clock: one outcome, warm words, the final board stays', () => {
    const p = props({ run: emptyRun(1), party: noMove });
    render(<StillWaterScreen {...p} />);
    begin();
    wait((LEAD_TICKS + 5 * 240) * 50 + 1500);
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('lost');
    expect(got.score).toBe(0);
    expect(screen.getByTestId('still-water-banner')).toHaveTextContent('The pond is still here. Try again whenever you like.');
    expect(screen.queryByTestId('still-water-hold')).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('a perfect player holds with the keys through the whole game and wins with a full score', () => {
    const p = props({ run: emptyRun(1), party: noMove });
    render(<StillWaterScreen {...p} />);
    begin();
    wait(LEAD_TICKS * 50 + 200);
    for (let cycle = 0; cycle < 5; cycle++) {
      fireEvent.keyDown(window, { key: ' ' });
      wait(6000);
      fireEvent.keyUp(window, { key: ' ' });
      wait(6000);
    }
    wait(300);
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('won');
    expect(got.score).toBe(1000);
    expect(screen.getByTestId('still-water-banner')).toHaveTextContent('Still water. Well breathed.');
    expect(screen.getByTestId('still-water-banner')).toHaveTextContent('Breath matched 100 %. Ripples let go: 1 of 1.');
  });

  it('writes French when the locale is fr, with tu', () => {
    const p = props({ locale: 'fr' });
    render(<StillWaterScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Eau calme');
    expect(screen.getByTestId('still-water-disclaimer')).toHaveTextContent(/ni une thérapie/);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Prépare-toi');
    begin();
    wait((LEAD_TICKS + 10) * 50);
    expect(screen.getByTestId('still-water-phase')).toHaveTextContent('Inspire');
    expect(screen.getByRole('button', { name: 'Suivre le souffle' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "S'éloigner" }));
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/étang/i);
    expect(screen.getByTestId('still-water-banner')).toHaveTextContent('Tu as quitté la berge');
  });
});
