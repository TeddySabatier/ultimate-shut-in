import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeProposalsDraft, openProposals, strings, type CustomDraft, type SaveFile } from '../game';
import { now } from '../state/clock';
import { useGameStore } from '../state/gameStore';
import { todayIndex } from '../state/selectors';
import { currentSave, renderWithRouter, seedStore } from '../test/storeUtils';
import { CharacterScreen } from '../screens/CharacterScreen';
import { QuestsScreen } from '../screens/QuestsScreen';

const c = strings.compose;

function draft(over: Partial<CustomDraft> = {}): CustomDraft {
  return { habit: 'study', kind: 'timer', durationMin: 25, title: 'Deep read', description: 'Quiet corner.', recurrence: 'daily', timeSlot: 'evening', source: 'voice', ...over };
}

/** Saves a template (not on the board) and returns its id. */
function saved(over: Partial<CustomDraft> = {}, board = false): string {
  expect(useGameStore.getState().composeQuest(draft(over), { board })).toBe(true);
  useGameStore.setState({ pendingEvents: [] });
  const t = currentSave().customTemplates.find((x) => x.title === (over.title ?? 'Deep read'));
  return t?.id ?? '';
}

const dialog = () => screen.getByRole('dialog', { name: c.editTitle });
const field = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const open = (title: string) => fireEvent.click(screen.getByRole('button', { name: `${c.myQuests.edit}: ${title}` }));
const tmpl = (id: string) => currentSave().customTemplates.find((t) => t.id === id);

describe('Ledger: editing a quest of your own', () => {
  it('opens the Compose sheet prefilled, in edit mode, with the same reward preview', () => {
    seedStore();
    saved();
    renderWithRouter(<CharacterScreen />);
    open('Deep read');
    const d = dialog();
    expect(within(d).getByText(c.editIntro)).toBeInTheDocument();
    expect(field(c.labels.name).value).toBe('Deep read');
    expect(field(c.labels.description).value).toBe('Quiet corner.');
    expect(field(c.labels.duration).value).toBe('25');
    expect(within(d).getByRole('radio', { name: /Imre/ })).toBeChecked();
    expect(within(d).getByRole('radio', { name: c.kinds.timer })).toBeChecked();
    expect((within(d).getByLabelText(c.labels.recurrence) as HTMLSelectElement).value).toBe('daily');
    expect((within(d).getByLabelText(c.labels.timeSlot) as HTMLSelectElement).value).toBe('evening');
    expect(within(d).getByRole('radio', { name: new RegExp(`2 ${c.tiers[1]}`) })).toBeChecked();
    expect(within(d).getByRole('list', { name: 'Rewards' })).toBeInTheDocument();
    // Edit mode has no sentence box, no microphone and no board buttons.
    expect(within(d).queryByLabelText(c.textLabel)).toBeNull();
    expect(within(d).queryByRole('button', { name: c.actions.board })).toBeNull();
    expect(within(d).queryByRole('button', { name: c.actions.later })).toBeNull();
    expect(within(d).getByRole('button', { name: c.actions.save })).toBeEnabled();
    expect(currentSave().customTemplates).toHaveLength(1);
  });

  it('Save changes applies every field, re-caps the tier by effort and shows one toast', () => {
    seedStore();
    const id = saved();
    renderWithRouter(<CharacterScreen />);
    open('Deep read');
    fireEvent.change(field(c.labels.name), { target: { value: 'Long read' } });
    fireEvent.change(field(c.labels.description), { target: { value: 'Two hours.' } });
    fireEvent.change(field(c.labels.duration), { target: { value: '45' } });
    fireEvent.change(within(dialog()).getByLabelText(c.labels.recurrence), { target: { value: 'pin:3' } });
    fireEvent.change(within(dialog()).getByLabelText(c.labels.timeSlot), { target: { value: 'morning' } });
    // A longer timer follows its effort to tier 3 until the player says otherwise.
    expect(within(dialog()).getByRole('radio', { name: new RegExp(`3 ${c.tiers[2]}`) })).toBeChecked();
    fireEvent.click(within(dialog()).getByRole('button', { name: c.actions.save }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tmpl(id)).toMatchObject({ title: 'Long read', description: 'Two hours.', durationMin: 45, tier: 3, recurrence: 'weekly:1', pinWeekday: 3, timeSlot: 'morning', source: 'voice' });
    expect(currentSave().customTemplates).toHaveLength(1);
    expect(useGameStore.getState().pendingEvents.filter((e) => e.type === 'customUpdated')).toHaveLength(1);
    // The list shows the new facts.
    const item = screen.getByRole('heading', { name: 'Long read' }).closest('li') as HTMLElement;
    expect(within(item).getByText(/45 min/)).toBeInTheDocument();
    expect(within(item).getByText(/Every Wednesday/)).toBeInTheDocument();
  });

  it('holds a hand-picked tier to what the effort allows and keeps it through other edits', () => {
    seedStore();
    const id = saved({ kind: 'check', durationMin: undefined, title: 'Tidy desk', habit: 'clean', tier: 2 });
    renderWithRouter(<CharacterScreen />);
    open('Tidy desk');
    expect(within(dialog()).getByRole('radio', { name: new RegExp(`2 ${c.tiers[1]}`) })).toBeChecked();
    expect(within(dialog()).getByRole('radio', { name: new RegExp(`3 ${c.tiers[2]}`) })).toBeDisabled();
    fireEvent.change(field(c.labels.name), { target: { value: 'Tidy the desk' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: c.actions.save }));
    expect(tmpl(id)).toMatchObject({ title: 'Tidy the desk', tier: 2 });
  });

  it('refuses an empty name and a bad length before any button works', () => {
    seedStore();
    const id = saved();
    renderWithRouter(<CharacterScreen />);
    open('Deep read');
    fireEvent.change(field(c.labels.name), { target: { value: '   ' } });
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/give it a name/i);
    expect(within(dialog()).getByRole('button', { name: c.actions.save })).toBeDisabled();
    fireEvent.change(field(c.labels.name), { target: { value: 'Deep read' } });
    fireEvent.change(field(c.labels.duration), { target: { value: '0' } });
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/a timer runs/i);
    expect(within(dialog()).getByRole('button', { name: c.actions.save })).toBeDisabled();
    expect(tmpl(id)?.durationMin).toBe(25);
  });

  it('warns about a duplicate title at once, allows its own name, and cancel changes nothing', () => {
    seedStore();
    const id = saved();
    saved({ title: 'Other read' });
    renderWithRouter(<CharacterScreen />);
    open('Deep read');
    fireEvent.change(field(c.labels.name), { target: { value: 'other READ' } });
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('You already have "other READ" in My quests.');
    expect(within(dialog()).getByRole('button', { name: c.actions.save })).toBeDisabled();
    // Another vassal may use the name.
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Wren/ }));
    expect(within(dialog()).queryByRole('alert')).toBeNull();
    expect(within(dialog()).getByRole('button', { name: c.actions.save })).toBeEnabled();
    fireEvent.click(within(dialog()).getByRole('button', { name: c.actions.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tmpl(id)).toMatchObject({ title: 'Deep read', habit: 'study' });
    // Reopened, the form starts from the saved quest again, and its own name is fine.
    open('Deep read');
    expect(field(c.labels.name).value).toBe('Deep read');
    expect(within(dialog()).queryByRole('alert')).toBeNull();
  });

  it('keeps the shape of a quest that is on today\'s board and still lets the name and schedule change', () => {
    seedStore();
    const id = saved({}, true);
    expect(currentSave().board?.quests.some((q) => q.templateId === id)).toBe(true);
    renderWithRouter(<CharacterScreen />);
    open('Deep read');
    const d = dialog();
    expect(within(d).getByText(c.notes.locked)).toBeInTheDocument();
    expect(within(d).getByLabelText(c.labels.duration)).toBeDisabled();
    for (const radio of within(d).getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(within(d).getByLabelText(c.labels.name)).toBeEnabled();
    fireEvent.change(field(c.labels.name), { target: { value: 'Deep read (slow)' } });
    fireEvent.change(within(d).getByLabelText(c.labels.recurrence), { target: { value: 'weekdays' } });
    fireEvent.click(within(d).getByRole('button', { name: c.actions.save }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tmpl(id)).toMatchObject({ title: 'Deep read (slow)', recurrence: 'weekdays', durationMin: 25, tier: 2 });
    // Today's copy still pays what it was issued with.
    const q = currentSave().board?.quests.find((x) => x.templateId === id);
    expect(q).toMatchObject({ habit: 'study', kind: 'timer', status: 'open' });
  });

  it('shows the engine\'s refusal inside the sheet and keeps it open', () => {
    seedStore();
    saved();
    renderWithRouter(<CharacterScreen />);
    open('Deep read');
    // The template disappears behind the sheet's back (archived elsewhere): the save is refused, not lost.
    const id = currentSave().customTemplates[0]?.id ?? '';
    useGameStore.getState().archiveCustom(id);
    useGameStore.setState({ pendingEvents: [] });
    fireEvent.change(field(c.labels.name), { target: { value: 'New name' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: c.actions.save }));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/not in My quests/i);
    expect(useGameStore.getState().notice).toBeNull();
    expect(tmpl(id)?.title).toBe('Deep read');
  });
});

describe('Ledger: archived quests and Restore', () => {
  it('lists archived quests under a collapsed group and brings one back with its history', () => {
    seedStore();
    const id = saved({ recurrence: 'once' });
    useGameStore.getState().archiveCustom(id);
    useGameStore.setState({ pendingEvents: [] });
    renderWithRouter(<CharacterScreen />);
    // Nothing active, so the empty note shows, and the group is collapsed.
    expect(screen.getByText(c.myQuests.empty, { exact: false })).toBeInTheDocument();
    const summary = screen.getByText(new RegExp(`^${c.myQuests.archivedGroup} \\(1\\)`));
    const group = summary.closest('details') as HTMLDetailsElement;
    expect(group.open).toBe(false);
    expect(within(group).getByText(c.myQuests.archivedHint)).toBeInTheDocument();
    // An archived quest has Restore, and no Edit, Add to today or Archive.
    const item = within(group).getByRole('heading', { name: 'Deep read' }).closest('li') as HTMLElement;
    expect(within(item).queryByRole('button', { name: new RegExp(`^${c.myQuests.edit}`) })).toBeNull();
    expect(within(item).queryByRole('button', { name: new RegExp(`^${c.myQuests.addToday}`) })).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: `${c.myQuests.restore}: Deep read` }));
    expect(tmpl(id)?.archivedAt).toBeUndefined();
    expect(useGameStore.getState().pendingEvents.filter((e) => e.type === 'customUpdated')).toHaveLength(1);
    // Now it is an ordinary quest again, the group is gone, and it is not on the board by itself.
    expect(screen.queryByText(new RegExp(`^${c.myQuests.archivedGroup}`))).toBeNull();
    const back = screen.getByRole('heading', { name: 'Deep read' }).closest('li') as HTMLElement;
    expect(within(back).getByRole('button', { name: `${c.myQuests.edit}: Deep read` })).toBeInTheDocument();
    expect(currentSave().board?.quests.some((q) => q.templateId === id)).toBe(false);
    fireEvent.click(within(back).getByRole('button', { name: `${c.myQuests.addToday}: Deep read` }));
    expect(currentSave().board?.quests.some((q) => q.templateId === id)).toBe(true);
  });

  it('disables Restore and says why when its name is taken again', () => {
    seedStore();
    const id = saved();
    useGameStore.getState().archiveCustom(id);
    saved({ title: 'Deep read' });
    renderWithRouter(<CharacterScreen />);
    const group = screen.getByText(new RegExp(`^${c.myQuests.archivedGroup}`)).closest('details') as HTMLElement;
    expect(within(group).getByText(c.myQuests.restoreNameTaken)).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: `${c.myQuests.restore}: Deep read` })).toBeDisabled();
    // Renaming the active one frees the name.
    open('Deep read');
    fireEvent.change(field(c.labels.name), { target: { value: 'Deep read 2' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: c.actions.save }));
    expect(within(group).getByRole('button', { name: `${c.myQuests.restore}: Deep read` })).toBeEnabled();
  });

  it('shows the newest archived quest first', () => {
    seedStore();
    const a = saved({ title: 'First' });
    const b = saved({ title: 'Second' });
    useGameStore.getState().archiveCustom(a);
    useGameStore.setState({ save: { ...currentSave(), customTemplates: currentSave().customTemplates.map((t) => (t.id === a ? { ...t, archivedAt: 1 } : t)) } });
    useGameStore.getState().archiveCustom(b);
    renderWithRouter(<CharacterScreen />);
    const group = screen.getByText(new RegExp(`^${c.myQuests.archivedGroup}`)).closest('details') as HTMLElement;
    expect(within(group).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Second', 'First']);
  });
});

describe('Board: a "make it a habit" proposal edits the quest instead of copying it', () => {
  function withRecurringProposal(): { save: SaveFile; id: string } {
    seedStore();
    const id = saved({ recurrence: 'once', title: 'Journal', habit: 'study', kind: 'check', durationMin: undefined });
    const base = structuredClone(currentSave());
    const today = todayIndex(base, now());
    base.firstPlayDay = today - 30;
    base.activity = [{ day: today - 10, entries: [{ templateId: 'move.old', habit: 'move', status: 'done' }] }];
    const t = base.customTemplates.find((x) => x.id === id);
    if (t) t.stats.done = 4;
    computeProposalsDraft(base, today);
    useGameStore.setState({ save: base });
    return { save: base, id };
  }

  it('says it updates the saved quest, and Accept changes its recurrence without a copy', () => {
    const { save, id } = withRecurringProposal();
    const p = openProposals(save).find((x) => x.rule === 'makeRecurring');
    expect(p).toBeDefined();
    renderWithRouter(<QuestsScreen />);
    const section = screen.getByRole('region', { name: strings.proposals.heading });
    const card = within(section).getAllByRole('listitem').find((li) => li.getAttribute('data-rule') === 'makeRecurring') as HTMLElement;
    expect(within(card).getByText(strings.proposals.updates)).toBeInTheDocument();
    expect(within(card).getByText('Journal (Twice a week)')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: new RegExp(`^${strings.proposals.accept}`) }));
    const after = currentSave();
    expect(after.customTemplates).toHaveLength(1);
    expect(after.customTemplates[0]).toMatchObject({ id, title: 'Journal', stats: { done: 4 } });
    expect(after.customTemplates[0]?.recurrence).not.toBe('once');
    expect(after.proposals.find((x) => x.id === p?.id)?.status).toBe('accepted');
  });
});
