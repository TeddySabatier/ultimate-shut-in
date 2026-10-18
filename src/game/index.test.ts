import { describe, expect, it } from 'vitest';
import * as game from './index';

describe('public API', () => {
  it('exposes the entry points the UI needs', () => {
    const names = [
      'createNewSave',
      'migrate',
      'processBoundaries',
      'generateBoard',
      'completeQuest',
      'undoQuest',
      'markTried',
      'startTimer',
      'pauseTimer',
      'incrementCount',
      'rerollQuest',
      'reRecruitVassal',
      'settleWave',
      'evaluateTitles',
      'forgeCombos',
      'applyResurrection',
      'resurrectionOffer',
      'gameDayIndex',
      'xpToNext',
      'validateContent',
      'fnv1a',
      'mulberry32',
    ] as const;
    for (const n of names) expect(typeof game[n], n).toBe('function');
    expect(game.SAVE_VERSION).toBe(2);
    expect(game.HABIT_IDS).toHaveLength(8);
    expect(game.MONSTERS.some((m) => m.boss)).toBe(true);
  });

  it('runs a first open and a completion end to end without mutating inputs', () => {
    const now = Date.UTC(2026, 3, 1, 12);
    const tz = { tz: game.fixedTz(0) };
    const save = game.createNewSave(now, 'Smoke', tz);
    Object.freeze(save);
    const opened = game.processBoundaries(save, now, tz);
    expect(opened.save.board?.quests.length).toBe(4);
    const first = opened.save.board!.quests[0]!;
    const done = game.completeQuest(opened.save, first.instanceId, now);
    expect(done.error).toBeUndefined();
    expect(done.save.player.xp).toBeGreaterThan(0);
    expect(opened.save.player.xp).toBe(0);
    const text = game.formatLine(game.pickLine(game.strings.questDone, done.save.board!.seed), {
      quest: game.getQuest(first.templateId)!.title,
      xp: done.save.player.xp,
      coins: done.save.player.coins,
      name: game.vassalName(first.habit),
    });
    expect(text).not.toContain('{');
    const back = game.migrate(JSON.parse(game.exportSave(done.save)), now, tz);
    expect(back).toEqual(done.save);
  });
});
