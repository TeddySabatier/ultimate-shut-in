import { describe, expect, it } from 'vitest';
import { DEFAULT_GAPS, insertAfter, progressOf, schedule, type CardProgress } from './scheduler';

const queue = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

describe('shared scheduler', () => {
  it('inserts after a delay, clamped to the queue', () => {
    expect(insertAfter(queue, 2, 'a')).toEqual(['b', 'c', 'a', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    expect(insertAfter(queue, 0, 'a')[0]).toBe('a');
    expect(insertAfter(queue, -3, 'a')[0]).toBe('a');
    expect(insertAfter(queue, 50, 'a').at(-1)).toBe('a');
    expect(insertAfter([], 5, 'a')).toEqual(['a']);
  });

  it('gives a blank record for an unknown card', () => {
    expect(progressOf([], 'x')).toEqual({ id: 'x', shows: 0, wrongs: 0, scheduledFinal: false });
    const known: CardProgress = { id: 'x', shows: 2, wrongs: 1, scheduledFinal: true };
    expect(progressOf([known], 'x')).toBe(known);
  });

  it('returns a first miss after 2 cards and a later miss after 5', () => {
    const first = schedule(queue, [], 'a', 0);
    expect(first.queue.indexOf('a')).toBe(2);
    expect(first.record).toEqual({ id: 'a', shows: 1, wrongs: 1, scheduledFinal: false });
    const second = schedule(queue, first.progress, 'a', 0);
    expect(second.queue.indexOf('a')).toBe(5);
    expect(second.record.wrongs).toBe(2);
  });

  it('books one final check after a first right answer, then nothing more', () => {
    const right = schedule(queue, [], 'a', 1);
    expect(right.queue.indexOf('a')).toBe(8);
    expect(right.record.scheduledFinal).toBe(true);
    const final = schedule(queue, right.progress, 'a', 1);
    expect(final.queue).not.toContain('a');
    expect(final.record.shows).toBe(2);
  });

  it('treats almost (0.5) as right for scheduling and does not count it as a miss', () => {
    const almost = schedule(queue, [], 'a', 0.5);
    expect(almost.queue.indexOf('a')).toBe(8);
    expect(almost.record.wrongs).toBe(0);
    expect(almost.record.scheduledFinal).toBe(true);
  });

  it('a miss after a right answer comes back soon, and a later right answer books no second final', () => {
    const right = schedule(queue, [], 'a', 1);
    const miss = schedule(queue, right.progress, 'a', 0);
    expect(miss.queue.indexOf('a')).toBe(2);
    const again = schedule(queue, miss.progress, 'a', 1);
    expect(again.queue).not.toContain('a');
  });

  it('never books past maxShows', () => {
    let progress: CardProgress[] = [];
    let last = queue;
    for (let i = 0; i < DEFAULT_GAPS.maxShows; i++) {
      const r = schedule(queue, progress, 'a', 0);
      progress = r.progress;
      last = r.queue;
    }
    expect(progressOf(progress, 'a').shows).toBe(4);
    expect(last).not.toContain('a');
  });

  it('honours custom gaps', () => {
    const r = schedule(queue, [], 'a', 1, { firstMiss: 1, laterMiss: 3, right: 6, maxShows: 2 });
    expect(r.queue.indexOf('a')).toBe(6);
    expect(schedule(queue, [], 'a', 0, { firstMiss: 1, laterMiss: 3, right: 6, maxShows: 2 }).queue.indexOf('a')).toBe(1);
  });

  it('moves the record to the end and never mutates its inputs', () => {
    const progress: CardProgress[] = Object.freeze([
      { id: 'a', shows: 1, wrongs: 1, scheduledFinal: false },
      { id: 'b', shows: 1, wrongs: 0, scheduledFinal: true },
    ]) as CardProgress[];
    const frozenQueue = Object.freeze([...queue]) as string[];
    const r = schedule(frozenQueue, progress, 'a', 1);
    expect(r.progress.map((p) => p.id)).toEqual(['b', 'a']);
    expect(frozenQueue).toEqual(queue);
    expect(progress[0]?.shows).toBe(1);
  });
});
