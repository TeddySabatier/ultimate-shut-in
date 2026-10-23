/**
 * The Screen plays the engine: lobby, one card, the explanation, forfeit,
 * leave, French copy, keyboard, typed and ordered cards, stored progress.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRun, type GameScreenProps, type Outcome } from '../contract';
// eslint-disable-next-line no-restricted-imports -- src/games/shared holds cross-game helpers (CONTRACT.md section 2)
import { cardsOf } from '../shared/decks';
import { parties, runs } from '../testing/contract';
import SubjectScrollsScreen from './Screen';
import { currentCard, engine, type Mode } from './engine';
import { STORAGE_KEY, deckStats, emptyStored, mergeRun, parseStored } from './progress';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.full, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

/** A seed whose run (single party, difficulty 4) reaches a card of `mode` within the first six cards, answering right. */
function seedWith(mode: Mode): number {
  for (let seed = 1; seed < 500; seed++) {
    let s = engine.initial(seed, parties.single, emptyRun(4), 'en');
    for (let i = 0; i < 6 && s.currentId; i++) {
      if (s.mode === mode) return seed;
      const card = currentCard(s)!;
      s = engine.reduce(s, s.mode === 'typed' ? { type: 'type', text: card.answer } : s.mode === 'ordered' ? { type: 'order', order: (card.steps ?? []).map((_, k) => k) } : { type: 'choose', index: s.options.indexOf(0) });
      s = engine.reduce(s, { type: 'next' });
    }
  }
  throw new Error(`no seed reaches a ${mode} card`);
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Answer the current card right through the UI (the card is looked up by its prompt) and move on. */
function answerRight() {
  const prompt = screen.getByTestId('subject-scrolls-prompt').textContent ?? '';
  const card = cardsOf(['kubernetes', 'ebpf']).find((c) => c.prompt === prompt)!;
  const input = screen.queryByTestId('subject-scrolls-input');
  if (input) {
    fireEvent.change(input, { target: { value: card.answer } });
    fireEvent.submit(input.closest('form')!);
  } else if (screen.queryByTestId('subject-scrolls-steps')) {
    for (const step of card.steps ?? []) fireEvent.click(screen.getByRole('button', { name: new RegExp(`^[1-5]${escapeRe(step)}$`) }));
    fireEvent.click(screen.getByTestId('subject-scrolls-order-submit'));
  } else {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^[1-4]${escapeRe(card.answer)}$`) }));
  }
  fireEvent.click(screen.getByTestId('subject-scrolls-next'));
}

function begin() {
  fireEvent.click(screen.getByTestId('subject-scrolls-begin'));
}

beforeEach(() => {
  localStorage.clear();
});

describe('Scroll Room screen', () => {
  it('opens on the lobby, begins with both decks, answers a card and shows the explanation with its source', () => {
    const p = props();
    render(<SubjectScrollsScreen {...p} />);
    expect(screen.getByTestId('subject-scrolls-lobby')).toBeInTheDocument();
    begin();
    expect(screen.queryByTestId('subject-scrolls-lobby')).toBeNull();
    const options = screen.getAllByRole('button', { name: /^[1-4]/ });
    expect(options).toHaveLength(4);
    fireEvent.click(options[0]!);
    expect(screen.getByTestId('subject-scrolls-explain')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Source:/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('subject-scrolls-next')).toHaveFocus();
    fireEvent.click(screen.getByTestId('subject-scrolls-next'));
    expect(screen.getByTestId('subject-scrolls-progress')).toHaveTextContent('Scroll 2');
    fireEvent.click(screen.getByRole('button', { name: 'Close the room' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.result).toBe('fled');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ v: 1, decks: ['kubernetes', 'ebpf'] });
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('keeps only the selected deck and stores the choice', () => {
    render(<SubjectScrollsScreen {...props()} />);
    fireEvent.click(screen.getByTestId('subject-scrolls-deck-kubernetes'));
    expect(screen.getByTestId('subject-scrolls-deck-kubernetes')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('subject-scrolls-deck-ebpf'));
    expect(screen.getByText('Pick at least one subject.')).toBeInTheDocument();
    expect(screen.getByTestId('subject-scrolls-begin')).toBeDisabled();
    fireEvent.click(screen.getByTestId('subject-scrolls-deck-ebpf'));
    begin();
    expect(parseStored(localStorage.getItem(STORAGE_KEY)).decks).toEqual(['ebpf']);
    expect(screen.getByTestId('subject-scrolls-card')).toHaveTextContent('eBPF');
  });

  it('renders French copy and accepts number keys', () => {
    render(<SubjectScrollsScreen {...props({ locale: 'fr' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Salle des parchemins');
    begin();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('subject-scrolls-explain')).toBeInTheDocument();
    expect(screen.getByText('Parchemin suivant')).toBeInTheDocument();
  });

  it('shows a focused typed field at difficulty 4 and the answer after a miss', () => {
    render(<SubjectScrollsScreen {...props({ run: emptyRun(4), party: parties.single, seed: seedWith('typed') })} />);
    begin();
    for (let i = 0; i < 6 && screen.queryByTestId('subject-scrolls-input') === null; i++) answerRight();
    const input = screen.getByTestId('subject-scrolls-input');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(screen.getByTestId('subject-scrolls-live').textContent).toMatch(/Not this time.*Answer: /);
  });

  it('builds an ordered answer with the keyboard, Backspace and Enter', () => {
    render(<SubjectScrollsScreen {...props({ run: emptyRun(4), party: parties.single, seed: seedWith('ordered') })} />);
    begin();
    for (let i = 0; i < 6 && screen.queryByTestId('subject-scrolls-steps') === null; i++) answerRight();
    const steps = screen.getAllByRole('button', { name: /^[1-5]/ });
    expect(screen.getByTestId('subject-scrolls-order-submit')).toBeDisabled();
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('subject-scrolls-sequence')).toHaveTextContent('Your order:');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('subject-scrolls-sequence')).toHaveTextContent('Tap the steps in order.');
    for (let i = 1; i <= steps.length; i++) fireEvent.keyDown(window, { key: String(i) });
    expect(screen.getByTestId('subject-scrolls-order-submit')).toBeEnabled();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('subject-scrolls-explain')).toBeInTheDocument();
  });

  it('an ordered card that comes back after a miss starts with no step placed', () => {
    render(<SubjectScrollsScreen {...props({ run: emptyRun(4), party: parties.single, seed: seedWith('ordered') })} />);
    begin();
    for (let i = 0; i < 6 && screen.queryByTestId('subject-scrolls-steps') === null; i++) answerRight();
    const prompt = screen.getByTestId('subject-scrolls-prompt').textContent;
    // Place the steps in the shown order (never the right one): the card comes back after 2 cards (wrong) or 6 (almost).
    const n = screen.getAllByRole('button', { name: /^[1-5]/ }).length;
    for (let i = 1; i <= n; i++) fireEvent.keyDown(window, { key: String(i) });
    fireEvent.click(screen.getByTestId('subject-scrolls-order-submit'));
    fireEvent.click(screen.getByTestId('subject-scrolls-next'));
    for (let i = 0; i < 12 && screen.getByTestId('subject-scrolls-prompt').textContent !== prompt; i++) answerRight();
    expect(screen.getByTestId('subject-scrolls-prompt').textContent).toBe(prompt);
    expect(screen.getByTestId('subject-scrolls-sequence')).toHaveTextContent('Tap the steps in order.');
    expect(screen.getAllByRole('button', { name: /^[1-5]/ }).every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('reads stored progress into the lobby and feeds the history to the engine', () => {
    const first = engine.initial(1, parties.full, runs.plain, 'en');
    const id = first.cardIds[0]!;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, decks: ['kubernetes', 'ebpf'], cards: { [id]: { seen: 2, wrongs: 0, lastRight: true } } }));
    render(<SubjectScrollsScreen {...props({ seed: 1 })} />);
    expect(screen.getByTestId(`subject-scrolls-deck-${id.startsWith('ebpf') ? 'ebpf' : 'kubernetes'}`)).toHaveTextContent('1 read, 1 mastered');
  });
});

describe('stored progress', () => {
  it('parses junk safely and merges a run', () => {
    expect(parseStored(null)).toEqual(emptyStored());
    expect(parseStored('{')).toEqual(emptyStored());
    expect(parseStored('{"decks":["nope"],"cards":{"a":{"seen":"x"},"b":{"seen":1,"wrongs":0,"lastRight":1}}}')).toEqual({ v: 1, decks: ['kubernetes', 'ebpf'], cards: { b: { seen: 1, wrongs: 0, lastRight: true } } });
    let s = engine.initial(1, parties.full, runs.plain, 'en');
    s = engine.reduce(s, { type: 'choose', index: s.options.findIndex((o) => o !== 0) });
    const merged = mergeRun({ v: 1, decks: ['ebpf'], cards: { [s.marks[0]!.id]: { seen: 1, wrongs: 0, lastRight: true } } }, s);
    expect(merged.cards[s.marks[0]!.id]).toEqual({ seen: 2, wrongs: 1, lastRight: false });
    expect(merged.decks).toEqual(['kubernetes', 'ebpf']);
    const stats = deckStats(merged, s.marks[0]!.id.startsWith('ebpf') ? 'ebpf' : 'kubernetes');
    expect(stats.seen).toBe(1);
    expect(stats.mastered).toBe(0);
  });
});
