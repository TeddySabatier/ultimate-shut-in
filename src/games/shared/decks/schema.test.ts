/**
 * The deck validator, one rule per test, on a tiny fake deck.
 */
import { describe, expect, it } from 'vitest';
import { hostAllowed, hostOf, normalizePrompt, tierShares, validateDeck, type Card, type Deck } from './schema';

function card(over: Partial<Card> = {}): Card {
  return {
    id: 'kubernetes-pods-01',
    subject: 'kubernetes',
    topic: 'pods',
    tier: 1,
    prompt: 'Which object is the smallest deployable unit?',
    answer: 'Pod',
    distractors: ['Container', 'Node', 'Deployment'],
    explanation: 'A Pod wraps one or more containers that share a network namespace and storage.',
    source: 'https://kubernetes.io/docs/concepts/workloads/pods/ | Kubernetes docs v1.37 | checked 2026-10-23',
    sourceUrl: 'https://kubernetes.io/docs/concepts/workloads/pods/',
    ...over,
  };
}

function deck(cards: Card[], over: Partial<Deck> = {}): Deck {
  return {
    subject: 'kubernetes',
    name: { en: 'Kubernetes', fr: 'Kubernetes' },
    credits: 'Kubernetes documentation, CC BY 4.0.',
    topics: [
      { id: 'pods', name: { en: 'Pods', fr: 'Pods' } },
      { id: 'probes', name: { en: 'Probes', fr: 'Sondes' } },
    ],
    cards,
    ...over,
  };
}

const problemsOf = (c: Partial<Card>) => validateDeck(deck([card(c)])).join('\n');

describe('deck validator', () => {
  it('accepts a valid deck', () => {
    expect(validateDeck(deck([card(), card({ id: 'kubernetes-probes-01', topic: 'probes', tier: 3, prompt: 'Why?' })]))).toEqual([]);
  });

  it('requires kebab-case ids with the subject prefix, unique across decks', () => {
    expect(problemsOf({ id: 'Kubernetes_Pods' })).toMatch(/not kebab-case/);
    expect(problemsOf({ id: 'ebpf-pods-01' })).toMatch(/must start with "kubernetes-"/);
    expect(validateDeck(deck([card(), card({ prompt: 'Other?' })])).join('\n')).toMatch(/duplicate id/);
    const seen = new Set(['kubernetes-pods-01']);
    expect(validateDeck(deck([card()]), seen).join('\n')).toMatch(/duplicate id/);
  });

  it('requires a known topic and a tier of 1 to 3', () => {
    expect(problemsOf({ topic: 'nope' })).toMatch(/not in the deck's topics/);
    expect(problemsOf({ tier: 4 as 1 })).toMatch(/tier must be 1, 2 or 3/);
    expect(problemsOf({ subject: 'ebpf', id: 'kubernetes-pods-02' })).toMatch(/differs from the deck/);
  });

  it('requires exactly one right option among four distinct ones', () => {
    expect(problemsOf({ distractors: ['Pod', 'Node', 'Deployment'] })).toMatch(/options repeat/);
    expect(problemsOf({ distractors: ['pod ', 'Node', 'Deployment'] })).toMatch(/options repeat/);
    expect(problemsOf({ distractors: ['A', 'A', 'B'] })).toMatch(/options repeat/);
    expect(problemsOf({ distractors: ['A', 'B'] as unknown as Card['distractors'] })).toMatch(/exactly three distractors/);
    expect(problemsOf({ distractors: ['', 'B', 'C'] })).toMatch(/option 1 is empty/);
    expect(problemsOf({ answer: 'x'.repeat(121) })).toMatch(/option 0 is 121 characters/);
  });

  it('rejects duplicate prompts, ignoring case, spacing and the final punctuation', () => {
    const d = deck([card(), card({ id: 'kubernetes-pods-02', prompt: '  which object is the smallest  deployable unit ' })]);
    expect(validateDeck(d).join('\n')).toMatch(/same prompt as kubernetes-pods-01/);
    expect(normalizePrompt('What is a Pod?')).toBe('what is a pod');
  });

  it('bounds the prompt and the explanation', () => {
    expect(problemsOf({ prompt: '' })).toMatch(/prompt is empty/);
    expect(problemsOf({ prompt: 'x'.repeat(241) })).toMatch(/prompt is 241 characters/);
    expect(problemsOf({ explanation: 'x'.repeat(240) })).toMatch(/explanation is 240 characters/);
    expect(problemsOf({ explanation: 'x'.repeat(239) })).toBe('');
    expect(problemsOf({ explanation: ' ' })).toMatch(/explanation is empty/);
  });

  it('requires an https sourceUrl on an allowed host, and a source that starts with it', () => {
    expect(problemsOf({ sourceUrl: 'http://kubernetes.io/docs/', source: 'http://kubernetes.io/docs/ | x' })).toMatch(/must be an https URL/);
    expect(problemsOf({ sourceUrl: 'https://example.com/x', source: 'https://example.com/x | x' })).toMatch(/host "example.com" is not in the allow-list/);
    expect(problemsOf({ source: 'Kubernetes docs' })).toMatch(/source must start with sourceUrl/);
    expect(problemsOf({ source: '' })).toMatch(/source is empty/);
    const pinned = 'https://v1-36.docs.kubernetes.io/docs/concepts/';
    expect(problemsOf({ sourceUrl: pinned, source: `${pinned} | Kubernetes docs v1.36 | checked 2026-10-23` })).toBe('');
  });

  it('matches hosts exactly or by wildcard suffix', () => {
    expect(hostOf('https://docs.kernel.org/bpf/verifier.html')).toBe('docs.kernel.org');
    expect(hostOf('https://Kubernetes.IO')).toBe('kubernetes.io');
    expect(hostOf('ftp://x.org/')).toBeNull();
    expect(hostAllowed('v1-36.docs.kubernetes.io', ['*.docs.kubernetes.io'])).toBe(true);
    expect(hostAllowed('docs.kubernetes.io', ['*.docs.kubernetes.io'])).toBe(false);
    expect(hostAllowed('evil-kubernetes.io', ['kubernetes.io'])).toBe(false);
  });

  it('checks accept and steps when present', () => {
    expect(problemsOf({ accept: [] })).toMatch(/accept must be a non-empty list/);
    expect(problemsOf({ accept: ['pod'] })).toMatch(/accept repeats the answer/);
    expect(problemsOf({ accept: ['pods'] })).toBe('');
    expect(problemsOf({ steps: ['a'] })).toMatch(/steps must have 2 to 5 entries/);
    expect(problemsOf({ steps: ['a', 'b', 'c', 'd', 'e', 'f'] })).toMatch(/steps must have 2 to 5 entries/);
    expect(problemsOf({ steps: ['a', 'A'] })).toMatch(/steps repeat/);
    expect(problemsOf({ steps: ['a', ''] })).toMatch(/a step is empty/);
    expect(problemsOf({ steps: ['open', 'load', 'attach'] })).toBe('');
  });

  it('rejects unknown fields and deck-level gaps', () => {
    expect(problemsOf({ note: 'x' } as Partial<Card>)).toMatch(/unknown field "note"/);
    expect(validateDeck(deck([card()], { topics: [] })).join('\n')).toMatch(/no topics/);
    expect(validateDeck(deck([])).join('\n')).toMatch(/no cards/);
    expect(validateDeck(deck([card()], { credits: '' })).join('\n')).toMatch(/credits is empty/);
    expect(validateDeck(deck([card()], { topics: [{ id: 'pods', name: { en: 'Pods', fr: 'Pods' } }, { id: 'pods', name: { en: 'x', fr: 'y' } }] })).join('\n')).toMatch(/listed twice/);
  });

  it('computes tier shares', () => {
    const d = deck([card(), card({ id: 'kubernetes-pods-02', prompt: 'B?', tier: 2 }), card({ id: 'kubernetes-pods-03', prompt: 'C?', tier: 2 }), card({ id: 'kubernetes-pods-04', prompt: 'D?', tier: 3 })]);
    expect(tierShares(d)).toEqual({ 1: 0.25, 2: 0.5, 3: 0.25 });
  });
});
