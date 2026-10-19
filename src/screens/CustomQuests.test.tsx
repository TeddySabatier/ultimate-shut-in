import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeProposalsDraft, openProposals, strings, type SaveFile } from '../game';
import { now } from '../state/clock';
import { useGameStore } from '../state/gameStore';
import { todayIndex } from '../state/selectors';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';
import { CharacterScreen } from './CharacterScreen';
import { QuestsScreen } from './QuestsScreen';

const c = strings.compose;

/** A save whose last day ended with an attempted, unfinished Move quest, with the proposals computed. */
function withProposal(): SaveFile {
  const save = seedStore('Tester');
  const draft = structuredClone(save);
  const today = todayIndex(draft, now());
  draft.firstPlayDay = today - 30;
  draft.activity = [{ day: today - 1, entries: [{ templateId: 'move.workout', habit: 'move', status: 'tried' }] }];
  computeProposalsDraft(draft, today);
  useGameStore.setState({ save: draft });
  return draft;
}

describe('Board: Compose entry point', () => {
  it('shows a prominent button that opens the sheet', () => {
    seedStore();
    renderWithRouter(<QuestsScreen />);
    const button = screen.getByRole('button', { name: new RegExp(c.open) });
    expect(button).toHaveClass('btn--primary');
    expect(button.querySelector('[class*="icon"]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: c.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: c.actions.cancel }));
    expect(screen.queryByLabelText(c.textLabel)).toBeNull();
  });

  it('puts a typed quest on the board as a card marked "Mine", without a swap button', () => {
    const save = seedStore();
    useGameStore.setState({ save: { ...save, player: { ...save.player, coins: 100 } } });
    renderWithRouter(<QuestsScreen />);
    const before = screen.getAllByRole('article').length;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.open) }));
    fireEvent.change(screen.getByLabelText(c.textLabel), { target: { value: 'tidy the kitchen' } });
    fireEvent.click(screen.getByRole('button', { name: c.actions.board }));
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(before + 1);
    const mine = cards.find((el) => within(el).queryByText('Tidy the Kitchen'));
    expect(mine).toBeDefined();
    expect(within(mine as HTMLElement).getByText('Mine')).toBeInTheDocument();
    expect(within(mine as HTMLElement).queryByRole('button', { name: /swap quest/i })).toBeNull();
    // Settling it goes through the ordinary quest path.
    fireEvent.click(within(mine as HTMLElement).getByRole('button', { name: /^done$/i }));
    expect(currentSave().stats.questsTotal).toBe(1);
    expect(currentSave().customTemplates[0]?.stats).toMatchObject({ issued: 1, done: 1 });
  });
});

describe('Board: "The Haven notices"', () => {
  it('shows nothing when there are no proposals', () => {
    seedStore();
    renderWithRouter(<QuestsScreen />);
    expect(screen.queryByRole('heading', { name: strings.proposals.heading })).toBeNull();
  });

  it('lists a proposal with its reason and Accept / Not now', () => {
    const save = withProposal();
    const proposal = openProposals(save).find((p) => p.rule === 'smaller');
    expect(proposal).toBeDefined();
    renderWithRouter(<QuestsScreen />);
    const section = screen.getByRole('region', { name: strings.proposals.heading });
    expect(within(section).getByText(proposal?.reason ?? '')).toBeInTheDocument();
    expect(within(section).getByText(strings.proposals.titles.smaller)).toBeInTheDocument();
    expect(within(section).getAllByRole('button', { name: new RegExp(strings.proposals.accept) }).length).toBeGreaterThan(0);
    expect(openProposals(save).length).toBeLessThanOrEqual(3);
    expect(within(section).getAllByRole('listitem').length).toBe(openProposals(save).length);
  });

  it('Accept adds the quest to today\'s board with one toast and removes the card', () => {
    const save = withProposal();
    const proposal = openProposals(save).find((p) => p.rule === 'smaller');
    renderWithRouter(<QuestsScreen />);
    const before = screen.getAllByRole('article').length;
    fireEvent.click(screen.getByRole('button', { name: `${strings.proposals.accept}: ${proposal?.title}` }));
    expect(screen.getAllByRole('article')).toHaveLength(before + 1);
    expect(currentSave().customTemplates[0]).toMatchObject({ source: 'proposal', habit: 'move' });
    expect(currentSave().proposals.find((p) => p.id === proposal?.id)?.status).toBe('accepted');
    expect(useGameStore.getState().pendingEvents.map((e) => e.type)).toEqual(['customBoarded']);
  });

  it('Not now snoozes it for a week and leaves the board alone', () => {
    const save = withProposal();
    const proposal = openProposals(save)[0];
    renderWithRouter(<QuestsScreen />);
    const before = screen.getAllByRole('article').length;
    fireEvent.click(screen.getByRole('button', { name: `${strings.proposals.dismiss}: ${proposal?.title}` }));
    expect(screen.getAllByRole('article')).toHaveLength(before);
    const after = currentSave().proposals.find((p) => p.id === proposal?.id);
    expect(after).toMatchObject({ status: 'dismissed' });
    expect(after?.snoozeUntil).toBe(todayIndex(currentSave(), now()) + 7);
    expect(currentSave().customTemplates).toHaveLength(0);
  });
});

describe('Ledger: My quests', () => {
  it('starts with an empty note and a way back to the Board', () => {
    seedStore();
    renderWithRouter(<CharacterScreen />);
    expect(screen.getByRole('heading', { name: c.myQuests.title })).toBeInTheDocument();
    expect(screen.getByText(c.myQuests.empty, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the Board' })).toHaveAttribute('href', '/quests');
  });

  it('lists each quest with its stats, adds it to today and archives it after a confirmation', () => {
    seedStore();
    expect(useGameStore.getState().composeQuest({ habit: 'study', kind: 'timer', durationMin: 25, title: 'Deep read', description: 'd', recurrence: 'daily', timeSlot: 'any', source: 'voice' }, { board: false })).toBe(true);
    useGameStore.setState({ pendingEvents: [] });
    renderWithRouter(<CharacterScreen />);
    const item = screen.getByRole('heading', { name: 'Deep read' }).closest('li') as HTMLElement;
    expect(within(item).getByText(/Imre/)).toBeInTheDocument();
    expect(within(item).getByText(/25 min/)).toBeInTheDocument();
    expect(within(item).getByText(/Every day/)).toBeInTheDocument();
    expect(within(item).getByText(c.myQuests.sources.voice)).toBeInTheDocument();
    expect(within(item).getByText('Issued 0, settled 0, attempted 0')).toBeInTheDocument();

    fireEvent.click(within(item).getByRole('button', { name: `${c.myQuests.addToday}: Deep read` }));
    expect(currentSave().board?.quests.some((q) => q.templateId.startsWith('c-'))).toBe(true);
    expect(within(item).getByText(c.myQuests.onBoard)).toBeInTheDocument();
    expect(within(item).getByText('Issued 1, settled 0, attempted 0')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: new RegExp(c.myQuests.addToday) })).toBeNull();

    fireEvent.click(within(item).getByRole('button', { name: `${c.myQuests.archive}: Deep read` }));
    expect(currentSave().customTemplates[0]?.archivedAt).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: c.myQuests.archive }));
    expect(currentSave().customTemplates[0]?.archivedAt).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Deep read' })).toBeNull();
    expect(screen.getByText(c.myQuests.empty, { exact: false })).toBeInTheDocument();
  });

  it('disables "Add to today" once two of your own are on the board', () => {
    seedStore();
    const { composeQuest } = useGameStore.getState();
    composeQuest({ habit: 'clean', kind: 'check', title: 'One', description: '', recurrence: 'once', timeSlot: 'any', source: 'text' }, { board: true });
    composeQuest({ habit: 'clean', kind: 'check', title: 'Two', description: '', recurrence: 'once', timeSlot: 'any', source: 'text' }, { board: true });
    composeQuest({ habit: 'eat', kind: 'check', title: 'Three', description: '', recurrence: 'once', timeSlot: 'any', source: 'text' }, { board: false });
    renderWithRouter(<CharacterScreen />);
    expect(screen.getByRole('button', { name: `${c.myQuests.addToday}: Three` })).toBeDisabled();
  });
});
