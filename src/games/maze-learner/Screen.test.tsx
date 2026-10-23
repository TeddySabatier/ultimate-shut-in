/**
 * The Screen plays the engine's game: keyboard, pointer and buttons reach the
 * same states the engine computes, the feed announces the changes, French
 * works, and forfeiting and leaving report once.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameScreenProps, Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine, initialAt, policyDir, windowRate } from './engine';
import MazeLearnerScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 11, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

const board = () => screen.getByTestId('maze-learner-board');
const cell = (kind: number) => board().querySelector(`[data-kind="${kind}"]`) as HTMLElement;
const feed = () => screen.getByTestId('maze-learner-feed');

describe('Maze Learner screen', () => {
  it('shows the lesson, the budget and a labelled grid with the cursor on the exit', () => {
    render(<MazeLearnerScreen {...props()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Maze Learner');
    expect(screen.getByRole('heading', { level: 3, name: 'First lesson' })).toBeInTheDocument();
    expect(screen.getByText('Lesson 1/5')).toBeInTheDocument();
    const s = initialAt(11, parties.full, runs.plain, 'en', 1);
    expect(screen.getByTestId('maze-learner-episodes')).toHaveTextContent(`Episodes 0/${s.budget}`);
    expect(board()).toHaveAttribute('role', 'grid');
    expect(within(board()).getAllByRole('row')).toHaveLength(s.height);
    expect(within(board()).getAllByRole('gridcell')).toHaveLength(s.width * s.height);
    expect(cell(3)).toHaveAttribute('tabindex', '0');
    expect(cell(3)).toHaveAccessibleName(/exit/);
  });

  it('C puts a cheese under the cursor and the feed announces it; training then draws arrows', async () => {
    render(<MazeLearnerScreen {...props()} />);
    fireEvent.keyDown(window, { key: 'c' });
    expect(cell(3)).toHaveAccessibleName(/exit, cheese/);
    expect(feed()).toHaveTextContent(/Cheese placed at row \d+, column \d+\./);
    expect(feed().getAttribute('aria-live')).toBe('polite');
    expect(board().querySelectorAll('svg[class*="arrow"]')).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('maze-learner-episodes')).not.toHaveTextContent(/Episodes 0\//));
    await waitFor(() => expect(board().querySelectorAll('svg[class*="arrow"]').length).toBeGreaterThan(0));
    expect(feed()).toHaveTextContent(/Episodes trained: \d+/);
  });

  it('arrow keys move the cursor over open tiles, skipping walls, and X and P write the other rewards', () => {
    render(<MazeLearnerScreen {...props({ seed: 3 })} />);
    const before = board().querySelector('[tabindex="0"]') as HTMLElement;
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) fireEvent.keyDown(window, { key });
    const after = board().querySelector('[tabindex="0"]') as HTMLElement;
    expect(before.dataset.kind).toBe('3');
    expect(after).not.toBe(before);
    expect(after.dataset.kind).not.toBe('0');
    fireEvent.keyDown(window, { key: 'p' });
    expect(after).toHaveAccessibleName(/puddle penalty/);
    fireEvent.keyDown(window, { key: 'x' });
    expect(after).not.toHaveAccessibleName(/puddle/);
    expect(feed()).toHaveTextContent(/Cleared row/);
  });

  it('the tool buttons choose what a tap or Space does', () => {
    render(<MazeLearnerScreen {...props()} />);
    const cheese = screen.getByRole('button', { name: 'Cheese' });
    const puddle = screen.getByRole('button', { name: 'Puddle' });
    expect(cheese).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(puddle);
    expect(puddle).toHaveAttribute('aria-pressed', 'true');
    expect(cheese).toHaveAttribute('aria-pressed', 'false');
    const floor = board().querySelector('[data-kind="1"]') as HTMLElement;
    fireEvent.pointerDown(floor, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(floor).toHaveAccessibleName(/puddle penalty/);
    fireEvent.click(screen.getByRole('button', { name: 'Erase' }));
    fireEvent.keyDown(floor, { key: ' ' });
    expect(floor).not.toHaveAccessibleName(/puddle/);
  });

  it('a finger writes a reward only when it taps: the start of a swipe does nothing', () => {
    render(<MazeLearnerScreen {...props()} />);
    const floor = board().querySelector('[data-kind="1"]') as HTMLElement;
    fireEvent.pointerDown(floor, { pointerId: 1, pointerType: 'touch' });
    expect(floor).not.toHaveAccessibleName(/crumb/);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.pointerDown(floor, { pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(window, { pointerId: 2, pointerType: 'touch' });
    fireEvent.click(floor);
    expect(floor).toHaveAccessibleName(/breadcrumb/);
  });

  it('the sliders set epsilon and the discount, and the numbers are read out', () => {
    render(<MazeLearnerScreen {...props()} />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
    expect(screen.getByText('Exploration (epsilon): 15%')).toBeInTheDocument();
    fireEvent.change(sliders[0]!, { target: { value: '60' } });
    expect(screen.getByText('Exploration (epsilon): 60%')).toBeInTheDocument();
    fireEvent.change(sliders[1]!, { target: { value: '30' } });
    expect(screen.getByText('Foresight (discount): 30%')).toBeInTheDocument();
  });

  it('shows what you just saw and the Next lesson button after a pass, then the next maze', async () => {
    render(<MazeLearnerScreen {...props({ party: parties.full })} />);
    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.click(screen.getByRole('button', { name: 'Train 50 fast' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next lesson' })).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByText('What you just saw')).toBeInTheDocument();
    expect(screen.getByText(/Nobody told the creature the way/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Traps' })).toBeInTheDocument();
    expect(screen.getByText('Lesson 2/5')).toBeInTheDocument();
  });

  it('Forfeit ends as fled once, keeps the board, and Leave then calls onExit', () => {
    const p = props();
    render(<MazeLearnerScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    expect(got.troopsUsed).toEqual(parties.full.members.map((m) => m.id));
    expect(screen.getByRole('status')).toHaveTextContent('You stepped away from the maze.');
    expect(board()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forfeit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
    expect(p.onFinish).toHaveBeenCalledTimes(1);
  });

  it('speaks French: title, lesson, tools and the outcome log', () => {
    const p = props({ locale: 'fr' });
    render(<MazeLearnerScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Labyrinthe apprenti');
    expect(screen.getByText('Leçon 1/5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fromage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flaque' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'c' });
    expect(feed()).toHaveTextContent(/Fromage posé ligne/);
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/apprentie attend/);
  });

  it('keys typed in a slider or a field are left alone', () => {
    render(<MazeLearnerScreen {...props()} />);
    const slider = screen.getAllByRole('slider')[0]!;
    slider.focus();
    fireEvent.keyDown(slider, { key: 'c' });
    expect(feed()).not.toHaveTextContent(/Cheese placed/);
  });

  it('Enter on a focused button keeps its own meaning (it does not start a training session)', () => {
    render(<MazeLearnerScreen {...props()} />);
    const forgetButton = screen.getByRole('button', { name: 'Forget' });
    forgetButton.focus();
    fireEvent.keyDown(forgetButton, { key: 'Enter' });
    expect(screen.getByTestId('maze-learner-episodes')).toHaveTextContent(/Episodes 0\//);
  });

  it('the game the screen plays is the game the engine computes', async () => {
    const p = props({ seed: 21 });
    render(<MazeLearnerScreen {...p} />);
    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('maze-learner-episodes')).toHaveTextContent(/Episodes 10\//));
    let s = initialAt(21, parties.full, runs.plain, 'en', 1);
    s = engine.reduce(s, { type: 'placeReward', cell: s.focus });
    s = engine.reduce(s, { type: 'train', episodes: 5 });
    s = engine.reduce(s, { type: 'train', episodes: 5 });
    expect(screen.getByTestId('maze-learner-success')).toHaveTextContent(`Success ${windowRate(s)}%`);
    const arrows = s.cells.filter((_, i) => policyDir(s, s.q, i) >= 0 && ![3].includes(s.cells[i] ?? 0)).length;
    expect(board().querySelectorAll('svg[class*="arrow"]').length).toBe(arrows);
    await act(async () => undefined);
  });
});
