/**
 * Subject decks: the cards the Scroll Room (and later the Archivist room)
 * ask. A deck is content, not code: one file per subject under this folder,
 * authored from the curated sources in `docs/learning/sources/<subject>.md`
 * and checked by `validateDeck` (unit-tested in `decks.test.ts`).
 *
 * Pure data and pure functions: this file loads with the registry.
 */
import type { LocalizedText } from '../../contract';

export const SUBJECT_IDS = ['kubernetes', 'ebpf'] as const;
export type SubjectId = (typeof SUBJECT_IDS)[number];

/** 1 recall, 2 apply, 3 troubleshooting or design puzzle. */
export type Tier = 1 | 2 | 3;

export interface Card {
  /** Kebab-case, unique across every deck, starts with the subject id: `kubernetes-probes-03`. */
  id: string;
  subject: SubjectId;
  /** One of the deck's `topics[].id`. */
  topic: string;
  tier: Tier;
  /** The question. At most 240 characters. */
  prompt: string;
  /** The one right option. At most 120 characters. */
  answer: string;
  /** Three plausible wrong options, distinct from each other and from the answer. */
  distractors: [string, string, string];
  /** Two lines that teach the point, under 240 characters. */
  explanation: string;
  /** Attribution in the format of the subject's sources file; starts with `sourceUrl`. */
  source: string;
  /** The exact page the card was written from; its host is in `SOURCE_HOSTS[subject]`. */
  sourceUrl: string;
  /** Other typed answers that count as right (spellings, synonyms). */
  accept?: string[];
  /** Ordered-answer cards: 2 to 5 steps in the right order. Played as "put these in order" from difficulty 3. */
  steps?: string[];
}

export interface Topic {
  id: string;
  name: LocalizedText;
}

export interface Deck {
  subject: SubjectId;
  name: LocalizedText;
  /** The licence notice the sources file asks for (CC BY attribution, MIT notices...). */
  credits: string;
  topics: Topic[];
  cards: Card[];
}

export const MAX_PROMPT = 240;
export const MAX_OPTION = 120;
export const MAX_EXPLANATION = 240;
export const MIN_STEPS = 2;
export const MAX_STEPS = 5;

/**
 * Hosts a card may cite, per subject. Every entry is a host that appears in
 * `docs/learning/sources/<subject>.md` (a unit test proves it against the file).
 * A `*.` prefix allows sub-domains, for the version-pinned docs hosts.
 */
export const SOURCE_HOSTS: Readonly<Record<SubjectId, readonly string[]>> = {
  kubernetes: [
    'kubernetes.io',
    '*.docs.kubernetes.io',
    'github.com',
    'kind.sigs.k8s.io',
    'minikube.sigs.k8s.io',
    'docs.cloud.google.com',
    'learnkube.com',
    'kubernetes-csi.github.io',
    'training.linuxfoundation.org',
    'labs.iximiuz.com',
  ],
  ebpf: [
    'ebpf.io',
    'docs.ebpf.io',
    'docs.kernel.org',
    'www.kernel.org',
    'man7.org',
    'libbpf.readthedocs.io',
    'github.com',
    'bpftool.dev',
    'nakryiko.com',
    'ebpf-go.dev',
    'bpftrace.org',
    'docs.cilium.io',
    'www.brendangregg.com',
    'kernelnewbies.org',
    'aya-rs.dev',
    'lore.kernel.org',
  ],
};

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Host of an https URL, or null when it is not one. */
export function hostOf(url: string): string | null {
  const m = /^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i.exec(url.trim());
  return m?.[1]?.toLowerCase() ?? null;
}

/** True when `host` is allowed by one entry (exact, or `*.` suffix). */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((a) => (a.startsWith('*.') ? host.endsWith(a.slice(1)) && host.length > a.length - 1 : a === host));
}

/** Prompts are compared trimmed, lower-cased, with collapsed spaces and no trailing punctuation. */
export function normalizePrompt(text: string): string {
  return text
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!:]+$/, '');
}

function fold(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Problems with one deck: unique kebab ids with the subject prefix, topic and
 * tier present, prompt, answer and distractors within limits with exactly one
 * right option, no duplicate prompt, explanation under 240 characters, a
 * source string starting with an https `sourceUrl` whose host is allowed,
 * well-formed `accept` and `steps`. Empty when the deck is valid.
 * `seenIds` lets a caller check uniqueness across decks.
 */
export function validateDeck(deck: Deck, seenIds: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const where = `deck ${deck.subject}`;
  if (!(SUBJECT_IDS as readonly string[]).includes(deck.subject)) out.push(`${where}: unknown subject`);
  if (!nonEmpty(deck.name?.en) || !nonEmpty(deck.name?.fr)) out.push(`${where}: name needs en and fr`);
  if (!nonEmpty(deck.credits)) out.push(`${where}: credits is empty`);
  const topicIds = new Set<string>();
  for (const t of deck.topics ?? []) {
    if (!ID_PATTERN.test(t.id)) out.push(`${where}: topic id "${t.id}" is not kebab-case`);
    if (topicIds.has(t.id)) out.push(`${where}: topic "${t.id}" listed twice`);
    topicIds.add(t.id);
    if (!nonEmpty(t.name?.en) || !nonEmpty(t.name?.fr)) out.push(`${where}: topic "${t.id}" needs en and fr names`);
  }
  if (topicIds.size === 0) out.push(`${where}: no topics`);
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    out.push(`${where}: no cards`);
    return out;
  }
  const prompts = new Map<string, string>();
  const allowed = SOURCE_HOSTS[deck.subject] ?? [];
  for (const c of deck.cards) {
    const at = `${where}, card ${c.id}`;
    if (!ID_PATTERN.test(c.id)) out.push(`${at}: id is not kebab-case`);
    if (!c.id.startsWith(`${deck.subject}-`)) out.push(`${at}: id must start with "${deck.subject}-"`);
    if (seenIds.has(c.id)) out.push(`${at}: duplicate id`);
    seenIds.add(c.id);
    if (c.subject !== deck.subject) out.push(`${at}: subject "${c.subject}" differs from the deck`);
    if (!topicIds.has(c.topic)) out.push(`${at}: topic "${c.topic}" is not in the deck's topics`);
    if (![1, 2, 3].includes(c.tier)) out.push(`${at}: tier must be 1, 2 or 3`);
    if (!nonEmpty(c.prompt)) out.push(`${at}: prompt is empty`);
    else if (c.prompt.length > MAX_PROMPT) out.push(`${at}: prompt is ${c.prompt.length} characters (at most ${MAX_PROMPT})`);
    const key = normalizePrompt(c.prompt ?? '');
    const other = prompts.get(key);
    if (other) out.push(`${at}: same prompt as ${other}`);
    else prompts.set(key, c.id);
    const options = [c.answer, ...(Array.isArray(c.distractors) ? c.distractors : [])];
    if (!Array.isArray(c.distractors) || c.distractors.length !== 3) out.push(`${at}: needs exactly three distractors`);
    options.forEach((o, i) => {
      if (!nonEmpty(o)) out.push(`${at}: option ${i} is empty`);
      else if (o.length > MAX_OPTION) out.push(`${at}: option ${i} is ${o.length} characters (at most ${MAX_OPTION})`);
    });
    const folded = options.filter(nonEmpty).map(fold);
    if (new Set(folded).size !== folded.length) out.push(`${at}: options repeat (exactly one must be right)`);
    if (!nonEmpty(c.explanation)) out.push(`${at}: explanation is empty`);
    else if (c.explanation.length >= MAX_EXPLANATION) out.push(`${at}: explanation is ${c.explanation.length} characters (under ${MAX_EXPLANATION})`);
    const host = nonEmpty(c.sourceUrl) ? hostOf(c.sourceUrl) : null;
    if (!host) out.push(`${at}: sourceUrl must be an https URL`);
    else if (!hostAllowed(host, allowed)) out.push(`${at}: host "${host}" is not in the allow-list for ${deck.subject}`);
    if (!nonEmpty(c.source)) out.push(`${at}: source is empty`);
    else if (nonEmpty(c.sourceUrl) && !c.source.trim().startsWith(c.sourceUrl.trim())) out.push(`${at}: source must start with sourceUrl`);
    if (c.accept !== undefined) {
      if (!Array.isArray(c.accept) || c.accept.length === 0 || !c.accept.every(nonEmpty)) out.push(`${at}: accept must be a non-empty list of strings`);
      else if (c.accept.some((a) => fold(a) === fold(c.answer))) out.push(`${at}: accept repeats the answer`);
    }
    if (c.steps !== undefined) {
      if (!Array.isArray(c.steps) || c.steps.length < MIN_STEPS || c.steps.length > MAX_STEPS) out.push(`${at}: steps must have ${MIN_STEPS} to ${MAX_STEPS} entries`);
      else {
        if (!c.steps.every(nonEmpty)) out.push(`${at}: a step is empty`);
        if (new Set(c.steps.map(fold)).size !== c.steps.length) out.push(`${at}: steps repeat`);
        if (c.steps.some((s) => s.length > MAX_OPTION)) out.push(`${at}: a step is over ${MAX_OPTION} characters`);
      }
    }
    for (const k of Object.keys(c)) {
      if (!['id', 'subject', 'topic', 'tier', 'prompt', 'answer', 'distractors', 'explanation', 'source', 'sourceUrl', 'accept', 'steps'].includes(k)) out.push(`${at}: unknown field "${k}"`);
    }
  }
  return out;
}

/** Share of cards per tier, for docs and balance checks. */
export function tierShares(deck: Deck): Record<Tier, number> {
  const n = deck.cards.length || 1;
  const count = (t: Tier) => deck.cards.filter((c) => c.tier === t).length / n;
  return { 1: count(1), 2: count(2), 3: count(3) };
}
