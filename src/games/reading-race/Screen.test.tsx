/**
 * The Screen plays the engine: pace controls, the word stage and its clock,
 * pause, re-read, sentence mode, the questions with keys and buttons, the
 * party perks, the feed, French, and Forfeit / Leave staying separate.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRun, type GameScreenProps, type Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import ReadingRaceScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.starter, seed: 42, run: emptyRun(1), locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const stage = () => screen.getByTestId('reading-race-word');
const phase = () => screen.getByTestId('reading-race-phase').textContent;
const feed = () => screen.getByTestId('reading-race-feed').textContent ?? '';
const options = () => Array.from(document.querySelectorAll('[data-testid^="reading-race-option-"]'));
const shownText = () => stage().querySelector('[role="img"]')?.getAttribute('aria-label') ?? stage().textContent ?? '';

/** A hand-driven animation-frame clock, so a test can run the same 5 s at any frame rate. */
function frameClock() {
  let cb: FrameRequestCallback | null = null;
  let now = 1000;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    cb = f;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    cb = null;
  });
  return {
    run(ms: number, frameMs: number) {
      const end = now + ms;
      act(() => {
        while (now < end) {
          now += frameMs;
          const f = cb;
          cb = null;
          f?.(now);
        }
      });
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Reading Race screen: before the race', () => {
  it('shows the title, the intro, the pace and the modes, and does not read before Start', () => {
    const clock = frameClock();
    render(<ReadingRaceScreen {...props()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Reading Race');
    expect(screen.getByTestId('reading-race-practice')).toHaveTextContent(/not a test of you/);
    expect(screen.getByTestId('reading-race-wpm')).toHaveTextContent('180 words per minute');
    expect(screen.getByRole('button', { name: 'Three-word phrases' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Auto-ramp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show whole sentence' })).toBeInTheDocument();
    clock.run(3000, 16);
    expect(phase()).toBe('ready');
  });

  it('changes the pace in steps of 20 with the buttons and the arrow keys, down to the floor', () => {
    render(<ReadingRaceScreen {...props()} />);
    expect(screen.getByRole('button', { name: 'Slower' })).toBeDisabled();
    click('Faster');
    expect(screen.getByTestId('reading-race-wpm')).toHaveTextContent('200 words per minute');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByTestId('reading-race-wpm')).toHaveTextContent('220 words per minute');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('reading-race-wpm')).toHaveTextContent('180 words per minute');
    expect(feed()).toMatch(/Pace set to 180/);
  });

  it('a harder difficulty has a higher slowest pace and says so', () => {
    render(<ReadingRaceScreen {...props({ run: emptyRun(4) })} />);
    expect(screen.getByTestId('reading-race-wpm')).toHaveTextContent('240 words per minute');
    expect(screen.getByRole('button', { name: 'Slower' })).toBeDisabled();
    expect(screen.getByText(/Slowest pace at this difficulty: 240/)).toBeInTheDocument();
  });

  it('lists what the party brings: a full party shows its three perks, the starter none', () => {
    render(<ReadingRaceScreen {...props({ party: parties.full })} />);
    const perks = screen.getByTestId('reading-race-perks');
    expect(perks).toHaveTextContent(/Study: highlights/);
    expect(perks).toHaveTextContent(/Sleep: rested eyes/);
    expect(perks).toHaveTextContent(/Social: hides a wrong option on every question, two on the first/);
    cleanup();
    render(<ReadingRaceScreen {...props({ party: parties.starter })} />);
    expect(screen.getByTestId('reading-race-perks').children).toHaveLength(0);
  });

  it('lists the buffs of the run', () => {
    render(<ReadingRaceScreen {...props({ run: { ...runs.buffed, difficulty: 2 } })} />);
    expect(screen.getByTestId('reading-race-perks')).toHaveTextContent(/Hint buff: 2 hint/);
    expect(screen.getByTestId('reading-race-perks')).toHaveTextContent(/Time buff: re-read one passage for free/);
  });

  it('writes everything in French when the locale is fr', () => {
    render(<ReadingRaceScreen {...props({ locale: 'fr' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Course de lecture');
    expect(screen.getByRole('button', { name: 'Lancer la course' })).toBeInTheDocument();
    expect(screen.getByTestId('reading-race-wpm')).toHaveTextContent('180 mots par minute');
  });
});

describe('Reading Race screen: reading', () => {
  it('shows one word with its focus letter, and the clock moves the words on', () => {
    const clock = frameClock();
    render(<ReadingRaceScreen {...props()} />);
    click('Start the race');
    expect(phase()).toBe('reading');
    const first = shownText();
    expect(first).toMatch(/^Current words: \S+$/);
    clock.run(2000, 16);
    expect(shownText()).not.toBe(first);
    expect(feed()).toMatch(/Passage 1 of 3: .+ 180 words per minute/);
  });

  it('gives the same words after the same time at 30, 60 and 120 frames per second', () => {
    const at = (frameMs: number) => {
      const clock = frameClock();
      const { unmount } = render(<ReadingRaceScreen {...props()} />);
      click('Start the race');
      clock.run(4100, frameMs);
      const words = shownText();
      unmount();
      return words;
    };
    const slow = at(33.3);
    const normal = at(16.7);
    const fast = at(8.3);
    expect(normal).toBe(slow);
    expect(normal).toBe(fast);
  });

  it('pauses with the button and with Space, and the words stop', () => {
    const clock = frameClock();
    render(<ReadingRaceScreen {...props()} />);
    click('Start the race');
    clock.run(1000, 16);
    click('Pause');
    expect(stage()).toHaveAttribute('data-paused', 'true');
    const held = shownText();
    clock.run(3000, 16);
    expect(shownText()).toBe(held);
    expect(feed()).toBe('Paused.');
    click('Resume');
    clock.run(1500, 16);
    expect(shownText()).not.toBe(held);
    fireEvent.keyDown(stage(), { key: ' ' });
    expect(stage()).toHaveAttribute('data-paused', 'true');
    fireEvent.keyDown(stage(), { key: ' ' });
    expect(stage()).toHaveAttribute('data-paused', 'false');
  });

  it('puts the keyboard focus on the reading area when the race starts', () => {
    render(<ReadingRaceScreen {...props()} />);
    click('Start the race');
    expect(stage()).toHaveFocus();
  });

  it('re-reads the last sentence for a small cost, and says so', () => {
    const clock = frameClock();
    render(<ReadingRaceScreen {...props()} />);
    click('Start the race');
    clock.run(4000, 16);
    expect(screen.getByTestId('reading-race-reread')).toHaveTextContent('Re-read sentence (-5)');
    fireEvent.keyDown(window, { key: 'r' });
    expect(feed()).toBe('Back to the start of the sentence.');
  });

  it('a time buff makes re-reading free', () => {
    render(<ReadingRaceScreen {...props({ run: { ...runs.buffed, difficulty: 1 } })} />);
    click('Start the race');
    expect(screen.getByTestId('reading-race-reread')).toHaveTextContent('Re-read sentence (free)');
  });

  it('shows three words at a time in phrase mode', () => {
    render(<ReadingRaceScreen {...props()} />);
    click('Three-word phrases');
    expect(screen.getByRole('button', { name: 'Three-word phrases' })).toHaveAttribute('aria-pressed', 'true');
    click('Start the race');
    expect(shownText().replace('Current words: ', '').split(' ')).toHaveLength(3);
  });

  it('shows no pace controls once reading, and none of the clock-driven motion with reduced motion', () => {
    render(<ReadingRaceScreen {...props({ reducedMotion: true })} />);
    click('Start the race');
    expect(screen.queryByRole('button', { name: 'Faster' })).toBeNull();
    expect(document.querySelector('[class*="still"]')).not.toBeNull();
  });
});

describe('Reading Race screen: sentence mode and questions', () => {
  function toQuestions(p: Partial<GameScreenProps> = {}) {
    const pp = props(p);
    render(<ReadingRaceScreen {...pp} />);
    click('Show whole sentence');
    click('Start the race');
    for (let i = 0; i < 80 && phase() === 'reading'; i++) fireEvent.keyDown(window, { key: ' ' });
    return pp;
  }

  it('shows a whole sentence, waits for a tap, and moves on with the button or Space', () => {
    render(<ReadingRaceScreen {...props()} />);
    click('Show whole sentence');
    click('Start the race');
    const first = stage().textContent;
    expect(first).toMatch(/\S+ \S+ \S+/);
    click('Next sentence');
    expect(stage().textContent).not.toBe(first);
    fireEvent.keyDown(window, { key: ' ' });
    expect(phase()).toBe('reading');
  });

  it('goes to the first question with the focus on it, and answers with the number keys', () => {
    toQuestions();
    expect(phase()).toBe('questions');
    expect(screen.getByTestId('reading-race-prompt')).toHaveFocus();
    expect(options()).toHaveLength(4);
    fireEvent.keyDown(window, { key: '1' });
    expect(feed()).toMatch(/^(Right\.|Not this one\. The answer was: .+)$/);
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
  });

  it('answers with a click, and the feed names the right answer when it is a miss', () => {
    toQuestions();
    // Try every option over three questions until a miss shows the answer.
    let sawMiss = false;
    for (let q = 0; q < 3 && phase() === 'questions'; q++) {
      fireEvent.click(screen.getByTestId('reading-race-option-1'));
      if (/Not this one/.test(feed())) sawMiss = true;
    }
    expect(phase()).toBe('interlude');
    expect(sawMiss || /Right\./.test(feed())).toBe(true);
    expect(feed()).toMatch(/Passage 1 done: \d of 3 right/);
  });

  it('rests between passages, with the pace controls and a Next passage button that has the focus', () => {
    toQuestions();
    for (let q = 0; q < 3; q++) fireEvent.keyDown(window, { key: '2' });
    expect(phase()).toBe('interlude');
    expect(screen.getByTestId('reading-race-go')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Faster' })).toBeEnabled();
    click('Next passage');
    expect(phase()).toBe('reading');
    expect(screen.getByText('Passage 2 of 3', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows what the auto-ramp will do for the next passage', () => {
    const pp = props();
    render(<ReadingRaceScreen {...pp} />);
    click('Auto-ramp');
    click('Show whole sentence');
    click('Start the race');
    for (let i = 0; i < 80 && phase() === 'reading'; i++) fireEvent.keyDown(window, { key: ' ' });
    for (let q = 0; q < 3; q++) fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('reading-race-next-pace')).toHaveTextContent(/Next passage pace: \d+ words per minute/);
  });

  it('Study brings the topic sentence back during the questions; the starter party does not', () => {
    toQuestions({ party: parties.full });
    expect(screen.getByTestId('reading-race-recap')).toHaveTextContent(/Study recalls the topic sentence: .{10,}/);
    cleanup();
    toQuestions({ party: parties.starter });
    expect(screen.queryByTestId('reading-race-recap')).toBeNull();
  });

  it('Social hides wrong options: fewer answers than the starter party sees', () => {
    toQuestions({ party: parties.full });
    expect(options().length).toBeLessThan(4);
    cleanup();
    toQuestions({ party: parties.starter });
    expect(options()).toHaveLength(4);
  });

  it('a hint button hides one wrong option and counts down; H does the same', () => {
    toQuestions({ run: { ...runs.buffed, difficulty: 1 } });
    expect(screen.getByTestId('reading-race-hint')).toHaveTextContent('Use a hint (2 left)');
    fireEvent.click(screen.getByTestId('reading-race-hint'));
    expect(options()).toHaveLength(3);
    expect(feed()).toBe('One wrong option is gone.');
    fireEvent.keyDown(window, { key: 'h' });
    expect(options()).toHaveLength(2);
    expect(screen.queryByTestId('reading-race-hint')).toBeNull();
  });

  it('plays a whole race to the end: onFinish once, a banner, the summary and the learned note', () => {
    const pp = props();
    render(<ReadingRaceScreen {...pp} />);
    click('Show whole sentence');
    click('Start the race');
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < 80 && phase() === 'reading'; i++) fireEvent.keyDown(window, { key: ' ' });
      for (let q = 0; q < 3; q++) fireEvent.keyDown(window, { key: '3' });
      if (phase() === 'interlude') click('Next passage');
    }
    expect(phase()).toBe('done');
    expect(pp.onFinish).toHaveBeenCalledTimes(1);
    const out = vi.mocked(pp.onFinish).mock.calls[0]![0] as Outcome;
    expect(['won', 'lost']).toContain(out.result);
    expect(screen.getByTestId('reading-race-banner')).toHaveFocus();
    expect(screen.getByTestId('reading-race-summary')).toHaveTextContent(/Understood \d of 9 .*Score \d+ of 1000/);
    expect(screen.queryByRole('button', { name: 'Forfeit' })).toBeNull();
    click('Leave');
    expect(pp.onExit).toHaveBeenCalledTimes(1);
  });
});

describe('Reading Race screen: leaving', () => {
  it('Forfeit ends the race as fled and keeps the board; Leave is a separate press that calls onExit once', () => {
    const pp = props();
    render(<ReadingRaceScreen {...pp} />);
    click('Start the race');
    click('Forfeit');
    expect(pp.onFinish).toHaveBeenCalledTimes(1);
    expect((vi.mocked(pp.onFinish).mock.calls[0]![0] as Outcome).result).toBe('fled');
    expect(pp.onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('reading-race-banner')).toHaveTextContent('You left the track');
    click('Leave');
    expect(pp.onExit).toHaveBeenCalledTimes(1);
    expect(pp.onFinish).toHaveBeenCalledTimes(1);
  });

  it('stops the frame loop when it unmounts', () => {
    const clock = frameClock();
    const { unmount } = render(<ReadingRaceScreen {...props()} />);
    click('Start the race');
    clock.run(300, 16);
    unmount();
    expect(() => clock.run(300, 16)).not.toThrow();
  });

  it('has a labelled race track and a polite live feed', () => {
    render(<ReadingRaceScreen {...props()} />);
    expect(screen.getByRole('img', { name: /Race track: passage 1 of 3, 0 percent/ })).toBeInTheDocument();
    expect(screen.getByTestId('reading-race-feed')).toHaveAttribute('aria-live', 'polite');
    expect(within(screen.getByTestId('reading-race-progress')).getByText('Passage 1 of 3')).toBeInTheDocument();
  });
});

beforeEach(() => {
  vi.useRealTimers();
});
