/**
 * Every installed deck passes the validator; every allowed host comes from the
 * subject's sources file; the tier mix is roughly 40 / 40 / 20.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DECKS, SOURCE_HOSTS, SUBJECT_IDS, cardsOf, getCard, hostOf, tierShares, validateDeck } from './index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function hostsInSourcesFile(subject: string): Set<string> {
  const text = readFileSync(resolve(root, 'docs', 'learning', 'sources', `${subject}.md`), 'utf8');
  const hosts = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add((m[1] ?? '').toLowerCase());
  return hosts;
}

describe('installed decks', () => {
  it('lists every subject id', () => {
    expect(Object.keys(DECKS).sort()).toEqual([...SUBJECT_IDS].sort());
  });

  const seen = new Set<string>();
  describe.each(SUBJECT_IDS)('%s', (subject) => {
    const deck = DECKS[subject];

    it('passes the validator', () => {
      expect(validateDeck(deck, seen)).toEqual([]);
    });

    it('allows only hosts that its sources file lists', () => {
      const listed = hostsInSourcesFile(subject);
      for (const allowed of SOURCE_HOSTS[subject]) {
        if (allowed.startsWith('*.')) expect([...listed].some((h) => h.endsWith(allowed.slice(1))), allowed).toBe(true);
        else expect(listed.has(allowed), allowed).toBe(true);
      }
      for (const c of deck.cards) expect(hostOf(c.sourceUrl) ?? '', c.id).not.toBe('');
    });

    it('has about 40 percent recall, 40 percent apply and 20 percent puzzles', () => {
      const shares = tierShares(deck);
      expect(shares[1]).toBeGreaterThanOrEqual(0.3);
      expect(shares[1]).toBeLessThanOrEqual(0.5);
      expect(shares[2]).toBeGreaterThanOrEqual(0.3);
      expect(shares[2]).toBeLessThanOrEqual(0.5);
      expect(shares[3]).toBeGreaterThanOrEqual(0.12);
      expect(shares[3]).toBeLessThanOrEqual(0.3);
    });

    it('covers every topic with at least five cards', () => {
      for (const t of deck.topics) expect(deck.cards.filter((c) => c.topic === t.id).length, t.id).toBeGreaterThanOrEqual(5);
    });

    it('has a few ordered-answer cards and short typed answers for most recall cards', () => {
      expect(deck.cards.filter((c) => c.steps).length).toBeGreaterThanOrEqual(4);
      const short = deck.cards.filter((c) => c.tier === 1 && c.answer.length <= 28).length;
      expect(short / Math.max(1, deck.cards.filter((c) => c.tier === 1).length)).toBeGreaterThanOrEqual(0.5);
    });
  });

  it('finds cards by id and by subject', () => {
    const first = DECKS.kubernetes.cards[0]!;
    expect(getCard(first.id)).toBe(first);
    expect(getCard('nope')).toBeUndefined();
    expect(cardsOf(['kubernetes', 'ebpf'])).toHaveLength(DECKS.kubernetes.cards.length + DECKS.ebpf.cards.length);
    expect(cardsOf([])).toEqual([]);
  });
});
