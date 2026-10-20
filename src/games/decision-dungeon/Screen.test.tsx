/**
 * The Screen plays the engine's game: clicking through it gives the outcome the
 * engine computes, onFinish fires once, the text is in the player's language,
 * and the perks and buffs show up as controls.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyRun, makeMember, type GameScreenProps, type Outcome } from '../contract';
import { parties, runs } from '../testing/contract';
import { engine } from './engine';
import DecisionDungeonScreen from './Screen';

function props(overrides: Partial<GameScreenProps> = {}): GameScreenProps {
  return { party: parties.starter, seed: 42, run: runs.plain, locale: 'en', reducedMotion: true, onFinish: vi.fn(), onExit: vi.fn(), ...overrides };
}

/** Take door 1 and move on until the game is over. */
function playFirstDoors(): void {
  for (let clicks = 0; clicks < 30; clicks++) {
    const door = screen.queryByRole('button', { name: /^(Door|Porte) 1/ });
    const next = screen.queryByRole('button', { name: /Next room|Salle suivante|See the result|Voir le résultat/ });
    if (door) fireEvent.click(door);
    else if (next) fireEvent.click(next);
    else break;
  }
}

const doors = () => within(screen.getByTestId('decision-dungeon-options')).getAllByRole('button');

describe('Decision Dungeon screen', () => {
  it('plays to the outcome the engine computes, and calls onFinish once', () => {
    const p = props();
    render(<DecisionDungeonScreen {...p} />);
    playFirstDoors();
    let s = engine.initial(42, p.party, p.run, 'en');
    while (!engine.outcome(s)) s = engine.reduce(s, s.phase === 'choose' ? { type: 'choose', index: 0 } : { type: 'continue' });
    const expected = engine.outcome(s);

    expect(p.onFinish).toHaveBeenCalledTimes(1);
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect({ ...got, durationMs: undefined }).toEqual({ ...expected, durationMs: undefined });
    expect(got.durationMs).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole('status')).toHaveTextContent(/troops come home/i);
  });

  it('ends with the reflection, the result summary and the tip, and no more doors', () => {
    render(<DecisionDungeonScreen {...props()} />);
    playFirstDoors();
    expect(screen.getByTestId('decision-dungeon-reflection')).toBeTruthy();
    const result = screen.getByTestId('decision-dungeon-result');
    expect(result).toHaveTextContent(/Doors that counted towards the win: \d of 5/);
    expect(result).toHaveTextContent(/Most used: /);
    expect(result).toHaveTextContent(/A tip to try. /);
    expect(screen.queryByTestId('decision-dungeon-options')).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Step away' })).toBeNull();
  });

  it('writes the screen and the outcome log in French when the locale is fr', () => {
    const p = props({ locale: 'fr' });
    render(<DecisionDungeonScreen {...p} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Donjon des choix');
    expect(screen.getByTestId('decision-dungeon-room')).toHaveTextContent(/Salle 1 sur 5/);
    playFirstDoors();
    const got = vi.mocked(p.onFinish).mock.calls[0]![0] as Outcome;
    expect(got.log[0]).toMatch(/^Salle 1/);
    expect(screen.getByRole('status')).toHaveTextContent(/Les troupes rentrent/);
  });

  it('shows the not-therapy note and the intro, and the intro only in the first room', () => {
    render(<DecisionDungeonScreen {...props()} />);
    expect(screen.getByText(/A game, not therapy/)).toBeTruthy();
    expect(screen.getByText(/no judging: it is practice/)).toBeTruthy();
    fireEvent.click(doors()[0]!);
    expect(screen.queryByText(/no judging: it is practice/)).toBeNull();
  });

  it('number keys choose doors, ignoring other keys and typing in a field', () => {
    const p = props();
    render(
      <>
        <input aria-label="seed" />
        <DecisionDungeonScreen {...p} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('seed'), { key: '1' });
    expect(screen.queryByTestId('decision-dungeon-reflection')).toBeNull();
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: '9' });
    expect(screen.queryByTestId('decision-dungeon-reflection')).toBeNull();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('decision-dungeon-reflection')).toBeTruthy();
  });

  it('moves the focus to the next button after a choice and to the new room after it', () => {
    render(<DecisionDungeonScreen {...props()} />);
    fireEvent.click(doors()[0]!);
    const next = screen.getByRole('button', { name: 'Next room' });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(document.activeElement).toBe(screen.getByTestId('decision-dungeon-situation').parentElement);
  });

  it('announces the reflection in a polite live region', () => {
    render(<DecisionDungeonScreen {...props()} />);
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live).toBeTruthy();
    expect(live.textContent).toBe('');
    fireEvent.click(doors()[0]!);
    expect(live).toContainElement(screen.getByTestId('decision-dungeon-reflection'));
    expect(live.textContent).toMatch(/You chose door 1: /);
  });

  it('Step away ends the run as fled and keeps the board; Leave then calls onExit once', () => {
    const p = props();
    render(<DecisionDungeonScreen {...p} />);
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onFinish).mock.calls[0]![0]).toMatchObject({ result: 'fled' });
    expect(p.onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('decision-dungeon-reflection')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent(/home early/);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });

  it('shows the plain cue on every door at difficulty 2 and hides it at difficulty 4', () => {
    const { unmount } = render(<DecisionDungeonScreen {...props()} />);
    expect(screen.getAllByTestId('decision-dungeon-cue').length).toBe(doors().length);
    unmount();
    render(<DecisionDungeonScreen {...props({ run: emptyRun(4) })} />);
    expect(screen.queryAllByTestId('decision-dungeon-cue')).toHaveLength(0);
    expect(screen.getByTestId('decision-dungeon-room')).toHaveTextContent('Room 1 of 6');
  });

  it('Study shows the reframing question; the starter party does not', () => {
    const study = [makeMember({ id: 'study', name: 'Mira', habit: 'study', level: 3, loyalty: 50 })];
    const { unmount } = render(<DecisionDungeonScreen {...props({ party: { members: study } })} />);
    expect(screen.getByTestId('decision-dungeon-reframe')).toHaveTextContent(/\?$/);
    unmount();
    render(<DecisionDungeonScreen {...props()} />);
    expect(screen.queryByTestId('decision-dungeon-reframe')).toBeNull();
  });

  it('Social shows a style tag on one door; a hint buff shows one more', () => {
    const social = { members: [makeMember({ id: 'social', name: 'Quill', habit: 'social', level: 12, loyalty: 80 })] };
    const hint = { ...emptyRun(2), buffs: [{ id: 'h', kind: 'hint' as const, amount: 1 }] };
    render(<DecisionDungeonScreen {...props({ party: social, run: hint })} />);
    expect(screen.getAllByTestId('decision-dungeon-tag')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Reveal a style \(1 left\)/ }));
    expect(screen.getAllByTestId('decision-dungeon-tag')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Reveal a style/ })).toBeNull();
  });

  it('Sleep on it: toggle, preview a door without choosing it, once per room', () => {
    const sleep = { members: [makeMember({ id: 'sleep', name: 'Nyx', habit: 'sleep', level: 1, loyalty: 50 })] };
    render(<DecisionDungeonScreen {...props({ party: sleep })} />);
    const toggle = screen.getByRole('button', { name: 'Sleep on it (1 left)' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Nothing is chosen yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Preview door 2/ }));
    expect(screen.getByTestId('decision-dungeon-peek')).toHaveTextContent(/Sleeping on door 2/);
    expect(screen.queryByTestId('decision-dungeon-reflection')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sleep on it/ })).toBeNull();
    fireEvent.click(doors()[0]!);
    expect(screen.getByTestId('decision-dungeon-reflection')).toBeTruthy();
  });

  it('a revive buff offers Choose again after a choice', () => {
    const revive = { ...emptyRun(2), buffs: [{ id: 'r', kind: 'revive' as const, amount: 1 }] };
    render(<DecisionDungeonScreen {...props({ run: revive })} />);
    fireEvent.click(doors()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Choose again (1 left)' }));
    expect(screen.getByTestId('decision-dungeon-options')).toBeTruthy();
    expect(screen.queryByTestId('decision-dungeon-reflection')).toBeNull();
    fireEvent.click(doors()[0]!);
    expect(screen.queryByRole('button', { name: /Choose again/ })).toBeNull();
  });

  it('names the last button "See the result" in the last room', () => {
    render(<DecisionDungeonScreen {...props()} />);
    for (let room = 0; room < 4; room++) {
      fireEvent.click(doors()[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Next room' }));
    }
    fireEvent.click(doors()[0]!);
    expect(screen.getByRole('button', { name: 'See the result' })).toBeTruthy();
  });

  it('moves the focus to the result line when the run ends, after the last room and after Step away', () => {
    const { unmount } = render(<DecisionDungeonScreen {...props()} />);
    playFirstDoors();
    expect(document.activeElement).toBe(screen.getByRole('status'));
    unmount();
    render(<DecisionDungeonScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Step away' }));
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it('hands the focus to the first door when the last hint removes its own button', () => {
    const hint = { ...emptyRun(2), buffs: [{ id: 'h', kind: 'hint' as const, amount: 1 }] };
    render(<DecisionDungeonScreen {...props({ run: hint })} />);
    const button = screen.getByRole('button', { name: /Reveal a style/ });
    button.focus();
    fireEvent.click(button);
    expect(screen.queryByRole('button', { name: /Reveal a style/ })).toBeNull();
    expect(document.activeElement).toBe(doors()[0]);
  });

  it('says that the keys preview a door while sleeping on it', () => {
    const sleep = { members: [makeMember({ id: 'sleep', name: 'Nyx', habit: 'sleep', level: 1, loyalty: 50 })] };
    render(<DecisionDungeonScreen {...props({ party: sleep })} />);
    expect(screen.getByText(/Keys 1 to \d choose a door/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sleep on it/ }));
    expect(screen.getByText(/Keys 1 to \d preview a door/)).toBeTruthy();
  });

  it('adds a "Checking first" line to the result when a curious door was taken', () => {
    let seed = 1;
    for (; seed < 200; seed++) {
      let s = engine.initial(seed, parties.starter, runs.plain, 'en');
      while (!engine.outcome(s)) s = engine.reduce(s, s.phase === 'choose' ? { type: 'choose', index: 0 } : { type: 'continue' });
      if (s.choices.some((c) => c.style === 'curious')) break;
    }
    render(<DecisionDungeonScreen {...props({ seed })} />);
    playFirstDoors();
    expect(screen.getByTestId('decision-dungeon-result')).toHaveTextContent(/Checking first: \d \(part of your toolbox/);
  });

  it('keeps every control a labelled button', () => {
    render(<DecisionDungeonScreen {...props()} />);
    for (const button of screen.getAllByRole('button')) expect(button.textContent?.trim().length).toBeGreaterThan(0);
  });
});
