import { describe, expect, it } from 'vitest';
import { generateBoard } from './board';
import { NOTES_MAX, setQuestLearned } from './notes';
import { createNewSave } from './save';
import { T0, TZ } from './testUtils';
import { gameDayIndex } from './time';

const DAY = gameDayIndex(T0, 4, TZ.tz);

function boarded() {
  const save = createNewSave(T0, 'Scholar', TZ);
  save.board = generateBoard(save, DAY);
  return save;
}

describe('setQuestLearned', () => {
  it('saves a note on the quest template and leaves the input save alone', () => {
    const save = boarded();
    const quest = save.board!.quests[0]!;
    const before = JSON.stringify(save);
    const r = setQuestLearned(save, quest.templateId, '  The long way\n\nhome is quieter.  ', T0 + 5);
    expect(r.error).toBeUndefined();
    expect(JSON.stringify(save)).toBe(before);
    expect(r.save.notes).toEqual([
      { templateId: quest.templateId, habit: quest.habit, title: expect.any(String), text: 'The long way\n\nhome is quieter.', updatedAt: T0 + 5 },
    ]);
    expect(r.save.board).toEqual(save.board);
  });

  it('keeps the note when a new board is issued, and updates it in place', () => {
    const save = boarded();
    const quest = save.board!.quests[0]!;
    const noted = setQuestLearned(save, quest.templateId, 'First thought', T0).save;
    const next = { ...noted, board: generateBoard(noted, DAY + 1) };
    expect(next.notes).toEqual(noted.notes);
    const again = setQuestLearned(next, quest.templateId, 'A clearer thought', T0 + 9).save;
    expect(again.notes).toHaveLength(1);
    expect(again.notes[0]).toMatchObject({ templateId: quest.templateId, text: 'A clearer thought', updatedAt: T0 + 9 });
  });

  it('clears the note when the text is empty and refuses an unknown quest', () => {
    const save = boarded();
    const quest = save.board!.quests[0]!;
    const noted = setQuestLearned(save, quest.templateId, 'Keep', T0).save;
    expect(setQuestLearned(noted, quest.templateId, '   \n  ', T0 + 1).save.notes).toEqual([]);
    const refused = setQuestLearned(noted, 'no.such.quest', 'hi', T0);
    expect(refused.error).toBe('that quest is not in the Haven');
    expect(refused.save).toBe(noted);
  });

  it('drops the oldest note past the cap', () => {
    let save = boarded();
    const ids = save.board!.quests.map((q) => q.templateId);
    const extra = Array.from({ length: NOTES_MAX }, (_, i) => `habit.note${i}`);
    for (const id of extra) {
      save = {
        ...save,
        notes: [{ templateId: id, habit: 'study', title: id, text: id, updatedAt: T0 + save.notes.length }, ...save.notes],
      };
    }
    const r = setQuestLearned(save, ids[0]!, 'The one that stays', T0 + 10_000);
    expect(r.save.notes).toHaveLength(NOTES_MAX);
    expect(r.save.notes[0]).toMatchObject({ templateId: ids[0], text: 'The one that stays' });
    expect(r.save.notes.some((n) => n.templateId === extra[0])).toBe(false);
  });
});
