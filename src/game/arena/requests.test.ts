import { describe, expect, it } from 'vitest';
import { arenaContent } from '../content';
import { at, deepFreeze, fresh } from '../testUtils';
import { cleanRequestText, requestGame, requestsLeft, requestsOn } from './requests';
import { REQUEST_MIN_LENGTH } from './state';

describe('ask for a game', () => {
  it('saves the request with its date, source and an id, and says so with an event', () => {
    const save = fresh();
    const r = requestGame(save, at(0), 'A game where you  water\n plants on time', 'voice');
    expect(r.error).toBeUndefined();
    expect(r.save.arena.requests).toHaveLength(1);
    expect(r.save.arena.requests[0]).toMatchObject({ id: 'q1', at: at(0), day: save.lastOpenDay, text: 'A game where you water plants on time', source: 'voice' });
    expect(r.events).toEqual([{ type: 'arenaRequestSaved', requestId: 'q1' }]);
    expect(save.arena.requests).toEqual([]);
  });

  it('cleans the text: collapses white space, trims, cuts at the limit', () => {
    expect(cleanRequestText('  a   b \n c  ')).toBe('a b c');
    expect(cleanRequestText('x'.repeat(arenaContent.requests.textMax + 50))).toHaveLength(arenaContent.requests.textMax);
    const r = requestGame(fresh(), at(0), `${'word '.repeat(200)}`);
    expect(r.save.arena.requests[0]!.text.length).toBeLessThanOrEqual(arenaContent.requests.textMax);
  });

  it('refuses text that is empty or too short', () => {
    const save = fresh();
    expect(requestGame(save, at(0), '').error).toBe('request too short');
    expect(requestGame(save, at(0), '   \n ').error).toBe('request too short');
    expect(requestGame(save, at(0), 'x'.repeat(REQUEST_MIN_LENGTH - 1)).error).toBe('request too short');
    expect(requestGame(save, at(0), 'x'.repeat(REQUEST_MIN_LENGTH)).error).toBeUndefined();
    expect(requestGame(save, at(0), '').save).toBe(save);
  });

  it('allows a few requests a day and starts again the next game day', () => {
    let save = fresh();
    const per = arenaContent.requests.perDay;
    for (let i = 0; i < per; i++) {
      expect(requestsLeft(save, at(0))).toBe(per - i);
      const r = requestGame(save, at(0), `Idea number ${i}`);
      expect(r.error).toBeUndefined();
      save = r.save;
    }
    expect(requestsOn(save, save.lastOpenDay)).toBe(per);
    expect(requestGame(save, at(0), 'One more idea').error).toBe('request limit');
    expect(requestsLeft(save, at(0))).toBe(0);
    expect(requestGame(save, at(1), 'Tomorrow idea').error).toBeUndefined();
    expect(requestsLeft(save, at(1))).toBe(per);
  });

  it('keeps only the newest requests', () => {
    let save = fresh();
    const total = arenaContent.requests.keep + 6;
    for (let i = 0; i < total; i++) save = requestGame(save, at(i), `Idea number ${i}`).save;
    expect(save.arena.requests).toHaveLength(arenaContent.requests.keep);
    expect(save.arena.requests[0]!.text).toBe('Idea number 6');
    expect(save.arena.requests[save.arena.requests.length - 1]!.text).toBe(`Idea number ${total - 1}`);
    expect(new Set(save.arena.requests.map((r) => r.id)).size).toBe(arenaContent.requests.keep);
  });

  it('never mutates the input', () => {
    expect(() => requestGame(deepFreeze(fresh()), at(0), 'A frozen idea')).not.toThrow();
  });

  it('is stored in the save only: a request changes nothing else', () => {
    const save = fresh();
    const r = requestGame(save, at(0), 'A quiet idea').save;
    expect({ ...r, arena: save.arena }).toEqual(save);
  });
});
