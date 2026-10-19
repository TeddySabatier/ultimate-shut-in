/**
 * The contract checks every game must pass, as plain functions. Each one
 * throws a `ContractViolation` listing every problem it found, or returns
 * quietly. `describeGameContract` (./contract.ts) wraps them in vitest tests;
 * the kit's own tests call them directly on deliberately broken games.
 *
 * No vitest import here.
 */
import {
  BUFF_KINDS,
  GAME_CATEGORIES,
  GAME_ID_PATTERN,
  GAME_RESULTS,
  MAX_SCORE,
  RESERVED_FOLDERS,
  fitParty,
  type GameModule,
  type Outcome,
  type Party,
  type RunBuffKind,
  type RunContext,
} from '../contract';
import { parties, runs, type PartyName, type RunName } from './fixtures';
import { DEFAULT_MAX_STEPS, playToEnd, type PlayResult } from './play';

export interface ContractOptions {
  /** The folder the game lives in; its id must equal it. Pass `folderOf(import.meta.url)`. */
  folder?: string;
  /** Step budget for one game played by the bot (default 20,000). */
  maxSteps?: number;
  /** Seeds to play (default `DEFAULT_SEEDS`, five of them). */
  seeds?: readonly number[];
  /** The game deliberately ignores run buffs: say why (at least 10 characters). */
  ignoresBuffs?: string;
  /** The game deliberately ignores who is in the party: say why (at least 10 characters). */
  ignoresParty?: string;
  /** Per-test timeout for the slow checks, in ms (default 60,000). */
  timeoutMs?: number;
}

export const DEFAULT_SEEDS: readonly number[] = [1, 7, 42, 1337, 90210];

/** Thrown by every check. The message lists each problem on its own line. */
export class ContractViolation extends Error {
  readonly problems: string[];
  constructor(check: string, problems: string[]) {
    const shown = problems.slice(0, 12);
    const more = problems.length > shown.length ? `\n  ... and ${problems.length - shown.length} more` : '';
    super(`${check}:\n  - ${shown.join('\n  - ')}${more}`);
    this.name = 'ContractViolation';
    this.problems = problems;
  }
}

function report(check: string, problems: string[]): void {
  if (problems.length > 0) throw new ContractViolation(check, problems);
}

/** The folder name of a test file: `folderOf(import.meta.url)` in `src/games/chess/contract.test.ts` is `chess`. */
export function folderOf(fileUrlOrPath: string): string {
  const parts = fileUrlOrPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 2] ?? '';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type AnyModule = GameModule<unknown, unknown>;

function asAny<S, A>(module: GameModule<S, A>): AnyModule {
  return module as unknown as AnyModule;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function message(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/** Stable JSON (sorted keys) for signatures and comparisons. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_key, value: unknown) => {
    if (isRecord(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) sorted[k] = value[k];
      return sorted;
    }
    return value;
  });
}

/** Path of the first difference between two plain values, or `null` when they are equal. */
export function firstDifference(a: unknown, b: unknown, path = 'state'): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${short(a)} vs ${short(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) {
    if (!(k in ra) || !(k in rb)) return `${path}.${k}: present in only one of them`;
    const d = firstDifference(ra[k], rb[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

function short(v: unknown): string {
  const s = typeof v === 'string' ? JSON.stringify(v) : String(v);
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

/** Problems that make `value` something other than plain JSON data. */
export function plainDataProblems(value: unknown, path: string, out: string[], limit = 5): void {
  if (out.length >= limit) return;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value} (numbers must be finite)`);
    return;
  }
  if (value === undefined) {
    out.push(`${path} is undefined (omit the key or use null)`);
    return;
  }
  if (typeof value !== 'object') {
    out.push(`${path} is a ${typeof value} (state and actions must be plain JSON data)`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => plainDataProblems(item, `${path}[${i}]`, out, limit));
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
    out.push(`${path} is a ${name} instance (use plain objects and arrays, no Map, Set, Date or classes)`);
    return;
  }
  for (const [k, v] of Object.entries(value)) plainDataProblems(v, `${path}.${k}`, out, limit);
}

function seedsOf(options: ContractOptions): readonly number[] {
  return options.seeds ?? DEFAULT_SEEDS;
}

function maxStepsOf(options: ContractOptions): number {
  return options.maxSteps ?? DEFAULT_MAX_STEPS;
}

/** The parties a game is played with: full and starter always, single when one member is enough. */
export function contractParties(module: AnyModule): PartyName[] {
  const min = module.manifest.rosterSize.min;
  const names: PartyName[] = ['full', 'starter'];
  if (min <= 1) names.push('single');
  return names;
}

function partyFor(module: AnyModule, name: PartyName): Party {
  return fitParty(parties[name], module.manifest);
}

// One cached play per (module, seed, party, run, maxSteps): the termination,
// outcome, seed, buff, party and bot checks share them.
const playCache = new WeakMap<object, Map<string, PlayResult<unknown, unknown>>>();

function cachedPlay(module: AnyModule, seed: number, party: PartyName, run: RunName | RunContext, maxSteps: number): PlayResult<unknown, unknown> {
  let byKey = playCache.get(module);
  if (!byKey) {
    byKey = new Map();
    playCache.set(module, byKey);
  }
  const runKey = typeof run === 'string' ? run : stableStringify(run);
  const key = `${seed}|${party}|${runKey}|${maxSteps}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const result = playToEnd(module, seed, partyFor(module, party), typeof run === 'string' ? runs[run] : run, maxSteps);
  byKey.set(key, result);
  return result;
}

/** What a play looks like from outside: the actions taken and the outcome. */
function signature(r: PlayResult<unknown, unknown>): string {
  return stableStringify({ actions: r.actions, outcome: r.outcome });
}

function label(seed: number, party: PartyName, run: string): string {
  return `seed ${seed}, parties.${party}, runs.${run}`;
}

// ---------------------------------------------------------------------------
// 1. Manifest
// ---------------------------------------------------------------------------

const MANIFEST_KEYS = ['id', 'name', 'tagline', 'category', 'minRing', 'rosterSize', 'estMinutes', 'supportsReducedMotion', 'learning', 'devOnly'];

function localizedProblems(v: unknown, path: string, maxLength: number, out: string[]): void {
  if (!isRecord(v)) {
    out.push(`${path} must be { en: string; fr: string }`);
    return;
  }
  for (const locale of ['en', 'fr'] as const) {
    const text = v[locale];
    if (!nonEmptyString(text)) out.push(`${path}.${locale} must be a non-empty string`);
    else if (text.length > maxLength) out.push(`${path}.${locale} is ${text.length} characters (at most ${maxLength})`);
  }
  for (const k of Object.keys(v)) if (k !== 'en' && k !== 'fr') out.push(`${path}.${k}: unknown locale (only en and fr)`);
}

/** The module shape and every manifest field. `folder`, when given, must equal the id. */
export function checkManifest<S, A>(module: GameModule<S, A>, folder?: string): void {
  const problems: string[] = [];
  const mod = module as unknown;
  if (!isRecord(mod)) {
    report('manifest', ['the default export of manifest.ts must be defineGame({ manifest, engine, strings })']);
    return;
  }
  const engine = mod.engine;
  if (!isRecord(engine)) problems.push('engine is missing');
  else for (const fn of ['initial', 'reduce', 'outcome', 'botPlay']) if (typeof engine[fn] !== 'function') problems.push(`engine.${fn} must be a function`);
  if (!isRecord(mod.strings)) problems.push('strings is missing');

  const m = mod.manifest;
  if (!isRecord(m)) {
    problems.push('manifest is missing');
    report('manifest', problems);
    return;
  }
  for (const k of Object.keys(m)) if (!MANIFEST_KEYS.includes(k)) problems.push(`manifest.${k}: unknown field`);

  const id = m.id;
  if (typeof id !== 'string' || !GAME_ID_PATTERN.test(id)) problems.push(`id ${JSON.stringify(id)} must be kebab-case (${GAME_ID_PATTERN})`);
  else {
    if (id.length > 32) problems.push(`id "${id}" is longer than 32 characters`);
    if (RESERVED_FOLDERS.includes(id)) problems.push(`id "${id}" is reserved (${RESERVED_FOLDERS.join(', ')})`);
    if (folder !== undefined && id !== folder) problems.push(`id "${id}" must equal its folder name "${folder}"`);
  }
  localizedProblems(m.name, 'name', 32, problems);
  localizedProblems(m.tagline, 'tagline', 100, problems);
  if (!(GAME_CATEGORIES as readonly unknown[]).includes(m.category)) problems.push(`category ${JSON.stringify(m.category)} must be one of ${GAME_CATEGORIES.join(', ')}`);
  if (!Number.isInteger(m.minRing) || (m.minRing as number) < 1 || (m.minRing as number) > 7) problems.push(`minRing ${String(m.minRing)} must be an integer from 1 to 7`);

  const roster = m.rosterSize;
  if (!isRecord(roster) || !Number.isInteger(roster.min) || !Number.isInteger(roster.max)) problems.push('rosterSize must be { min: integer; max: integer }');
  else {
    const min = roster.min as number;
    const max = roster.max as number;
    if (min < 1 || min > 3) problems.push(`rosterSize.min ${min} must be 1 to 3 (a new player has three vassals)`);
    if (max < min || max > 8) problems.push(`rosterSize.max ${max} must be from rosterSize.min to 8`);
  }
  if (typeof m.estMinutes !== 'number' || !(m.estMinutes >= 1 && m.estMinutes <= 5)) problems.push(`estMinutes ${String(m.estMinutes)} must be a number from 1 to 5`);
  if (m.supportsReducedMotion !== true) problems.push('supportsReducedMotion must be true (every game honours reduced motion)');
  if (m.devOnly !== undefined && typeof m.devOnly !== 'boolean') problems.push('devOnly must be a boolean when present');

  if (m.learning !== undefined) {
    if (!isRecord(m.learning)) problems.push('learning must be { skill: LocalizedText; concepts: string[] }');
    else {
      localizedProblems(m.learning.skill, 'learning.skill', 100, problems);
      const concepts = m.learning.concepts;
      if (!Array.isArray(concepts) || concepts.length === 0 || !concepts.every(nonEmptyString)) problems.push('learning.concepts must be a non-empty array of non-empty strings');
    }
  } else if (m.category === 'ai-learning') problems.push('learning is required for the ai-learning category');
  report('manifest', problems);
}

// ---------------------------------------------------------------------------
// 2. Strings
// ---------------------------------------------------------------------------

function placeholders(v: unknown): string {
  const texts = Array.isArray(v) ? v : [v];
  const set = new Set<string>();
  for (const t of texts) if (typeof t === 'string') for (const m of t.matchAll(/\{(\w+)\}/g)) set.add(m[1] ?? '');
  return [...set].sort().join(',');
}

function leafProblems(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'string') {
    if (v.trim().length === 0) out.push(`${path} is an empty string`);
  } else if (Array.isArray(v)) {
    if (v.length === 0) out.push(`${path} is an empty array`);
    v.forEach((item, i) => {
      if (!nonEmptyString(item)) out.push(`${path}[${i}] must be a non-empty string`);
    });
  } else out.push(`${path} must be a string, an array of strings or an object (got ${v === null ? 'null' : typeof v})`);
}

function compareTrees(en: unknown, fr: unknown, path: string, out: string[]): void {
  if (isRecord(en) && isRecord(fr)) {
    const keys = new Set([...Object.keys(en), ...Object.keys(fr)]);
    if (keys.size === 0) out.push(`${path} is an empty object`);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in en)) out.push(`fr.${p} has no English counterpart`);
      else if (!(k in fr)) out.push(`en.${p} is missing in French`);
      else compareTrees(en[k], fr[k], p, out);
    }
    return;
  }
  if (isRecord(en) !== isRecord(fr)) {
    out.push(`${path}: an object in one language and a leaf in the other`);
    return;
  }
  leafProblems(en, `en.${path}`, out);
  leafProblems(fr, `fr.${path}`, out);
  const a = placeholders(en);
  const b = placeholders(fr);
  if (a !== b) out.push(`${path}: placeholders differ (en {${a}} vs fr {${b}})`);
}

/** Same key tree in en and fr, string (or string array) leaves, nothing empty, same `{placeholders}`. */
export function checkStrings<S, A>(module: GameModule<S, A>): void {
  const problems: string[] = [];
  const s = (module as unknown as { strings?: unknown }).strings;
  if (!isRecord(s) || !isRecord(s.en) || !isRecord(s.fr)) {
    report('strings', ['strings must be { en: {...}, fr: {...} } (use defineStrings)']);
    return;
  }
  for (const k of Object.keys(s)) if (k !== 'en' && k !== 'fr') problems.push(`strings.${k}: unknown locale (only en and fr)`);
  compareTrees(s.en, s.fr, '', problems);
  report('strings', problems);
}

// ---------------------------------------------------------------------------
// 3. Determinism
// ---------------------------------------------------------------------------

/** Two fresh plays from the same seed, party and run are identical: states, actions, outcome. */
export function checkDeterminism<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const cases: [number, PartyName, RunName][] = [
    [seeds[0] ?? 1, 'full', 'plain'],
    [seeds[1] ?? 2, 'starter', 'plain'],
    [seeds[0] ?? 1, 'full', 'buffed'],
  ];
  for (const [seed, party, run] of cases) {
    const where = label(seed, party, run);
    try {
      const p = partyFor(mod, party);
      const init = firstDifference(mod.engine.initial(seed, p, runs[run]), mod.engine.initial(seed, p, runs[run]), 'initial');
      if (init) {
        problems.push(`${where}: initial() differs between two calls at ${init} (randomness must come from the seed only)`);
        continue;
      }
      const a = playToEnd(mod, seed, p, runs[run], maxSteps);
      const b = playToEnd(mod, seed, p, runs[run], maxSteps);
      const d =
        (a.steps !== b.steps ? `steps: ${a.steps} vs ${b.steps}` : null) ??
        firstDifference(a.actions, b.actions, 'actions') ??
        firstDifference(a.state, b.state, 'final state') ??
        firstDifference(a.outcome, b.outcome, 'outcome');
      if (d) problems.push(`${where}: two plays differ at ${d} (no Math.random, no clock, no module-level state)`);
    } catch (e) {
      problems.push(`${where}: engine threw ${message(e)}`);
    }
  }
  report('determinism', problems);
}

// ---------------------------------------------------------------------------
// 4. Termination
// ---------------------------------------------------------------------------

function playMatrix(mod: AnyModule, options: ContractOptions): [number, PartyName, RunName][] {
  const cases: [number, PartyName, RunName][] = [];
  for (const seed of seedsOf(options)) {
    for (const party of contractParties(mod)) cases.push([seed, party, 'plain']);
    cases.push([seed, 'full', 'buffed'], [seed, 'full', 'hard']);
  }
  return cases;
}

/**
 * The bot finishes every game within `maxSteps` (5 seeds, every party, plain,
 * buffed and hard runs); `botPlay` returns null exactly when the game is over;
 * a finished game stays finished with the same outcome.
 */
export function checkTermination<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const maxSteps = maxStepsOf(options);
  for (const [seed, party, run] of playMatrix(mod, options)) {
    const where = label(seed, party, run);
    try {
      const start = mod.engine.initial(seed, partyFor(mod, party), runs[run]);
      if (mod.engine.outcome(start) !== null) {
        problems.push(`${where}: outcome(initial) must be null (the game has not started)`);
        continue;
      }
      const r = cachedPlay(mod, seed, party, run, maxSteps);
      if (r.stopped === 'maxSteps') {
        problems.push(`${where}: no outcome after ${maxSteps} steps (does the game end? is botPlay making progress?)`);
        continue;
      }
      if (r.stopped === 'botReturnedNull') {
        problems.push(`${where}: botPlay returned null at step ${r.steps} while outcome(state) is still null`);
        continue;
      }
      if (mod.engine.botPlay(r.state, () => 0.5) !== null) problems.push(`${where}: botPlay must return null once the game is over`);
      const last = r.actions[r.actions.length - 1];
      if (last !== undefined) {
        const after = mod.engine.outcome(mod.engine.reduce(r.state, last));
        const d = firstDifference(r.outcome, after, 'outcome');
        if (d) problems.push(`${where}: an action after the end changed the outcome (${d}); finished games ignore actions`);
      }
    } catch (e) {
      problems.push(`${where}: engine threw ${message(e)}`);
    }
  }
  report('termination', problems);
}

// ---------------------------------------------------------------------------
// 5. Purity
// ---------------------------------------------------------------------------

/**
 * States and actions are deep-frozen before every `reduce` and `botPlay`:
 * the engine must neither throw nor mutate. States and actions must be plain
 * JSON data. The frozen play equals an unfrozen one.
 */
export function checkPurity<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const cases: [number, PartyName][] = [
    [seeds[0] ?? 1, 'full'],
    [seeds[1] ?? 2, 'starter'],
  ];
  for (const [seed, party] of cases) {
    const where = label(seed, party, 'plain');
    const dataProblems: string[] = [];
    let frozen: PlayResult<unknown, unknown>;
    try {
      frozen = playToEnd(mod, seed, partyFor(mod, party), runs.plain, maxSteps, {
        freeze: true,
        inspect: (state, step) => {
          // Check the first states and then a sample: enough to catch a Map or a closure in the state.
          if (dataProblems.length === 0 && (step < 20 || step % 50 === 0)) plainDataProblems(state, `state (step ${step})`, dataProblems);
        },
      });
    } catch (e) {
      problems.push(`${where}: threw on a deep-frozen state, so it mutates its input: ${message(e)}`);
      continue;
    }
    plainDataProblems(frozen.state, 'final state', dataProblems);
    frozen.actions.slice(0, 20).forEach((a, i) => plainDataProblems(a, `action ${i}`, dataProblems));
    for (const p of dataProblems) problems.push(`${where}: ${p}`);
    try {
      const loose = playToEnd(mod, seed, partyFor(mod, party), runs.plain, maxSteps);
      const d = firstDifference(frozen.state, loose.state, 'final state') ?? firstDifference(frozen.outcome, loose.outcome, 'outcome');
      if (d) problems.push(`${where}: a frozen play and a normal play differ at ${d}`);
    } catch (e) {
      problems.push(`${where}: engine threw ${message(e)}`);
    }
  }
  report('purity', problems);
}

// ---------------------------------------------------------------------------
// 6. Outcomes
// ---------------------------------------------------------------------------

const OUTCOME_KEYS = ['result', 'score', 'log', 'troopsUsed', 'durationMs', 'learned', 'stats'];

/** Problems with one outcome, given the ids of the party that played. */
export function outcomeProblems(o: Outcome | null, partyIds: readonly string[]): string[] {
  const out: string[] = [];
  if (!isRecord(o)) return ['outcome must be an object'];
  for (const k of Object.keys(o)) if (!OUTCOME_KEYS.includes(k)) out.push(`outcome.${k}: unknown field`);
  if (!(GAME_RESULTS as readonly unknown[]).includes(o.result)) out.push(`result ${JSON.stringify(o.result)} must be won, lost or fled`);
  if (!Number.isInteger(o.score) || o.score < 0 || o.score > MAX_SCORE) out.push(`score ${String(o.score)} must be an integer from 0 to ${MAX_SCORE} (use clampScore)`);
  if (!Array.isArray(o.log) || o.log.length === 0) out.push('log must have at least one line');
  else o.log.forEach((line, i) => {
    if (!nonEmptyString(line)) out.push(`log[${i}] must be a non-empty string`);
  });
  if (!Array.isArray(o.troopsUsed)) out.push('troopsUsed must be an array of member ids');
  else {
    const seen = new Set<string>();
    for (const id of o.troopsUsed) {
      if (!partyIds.includes(id)) out.push(`troopsUsed has "${String(id)}", which is not in the party (${partyIds.join(', ')})`);
      if (seen.has(id)) out.push(`troopsUsed lists "${id}" twice`);
      seen.add(id);
    }
  }
  if (o.durationMs !== undefined && !(typeof o.durationMs === 'number' && Number.isFinite(o.durationMs) && o.durationMs >= 0)) out.push('durationMs must be a finite number >= 0');
  if (o.learned !== undefined) {
    if (!isRecord(o.learned)) out.push('learned must be { topic, note }');
    else {
      localizedProblems(o.learned.topic, 'learned.topic', 100, out);
      localizedProblems(o.learned.note, 'learned.note', 400, out);
    }
  }
  if (o.stats !== undefined) {
    if (!isRecord(o.stats)) out.push('stats must be a record');
    else for (const [k, v] of Object.entries(o.stats)) if (!(typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) out.push(`stats.${k} must be a finite number or a string`);
  }
  plainDataProblems(o, 'outcome', out);
  return out;
}

/** Every outcome of the play matrix is valid. */
export function checkOutcomes<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  for (const [seed, party, run] of playMatrix(mod, options)) {
    const where = label(seed, party, run);
    try {
      const r = cachedPlay(mod, seed, party, run, maxStepsOf(options));
      if (!r.outcome) {
        problems.push(`${where}: the game did not end (see the termination check)`);
        continue;
      }
      const ids = partyFor(mod, party).members.map((m) => m.id);
      for (const p of outcomeProblems(r.outcome, ids)) problems.push(`${where}: ${p}`);
    } catch (e) {
      problems.push(`${where}: engine threw ${message(e)}`);
    }
  }
  report('outcomes', problems);
}

// ---------------------------------------------------------------------------
// 7. Seeds, buffs, party, bot
// ---------------------------------------------------------------------------

/** At least 3 of the 5 seeds give different games (the bot's actions and the outcome, not just a stored number). */
export function checkSeedsDiffer<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const seeds = seedsOf(options);
  const distinct = new Set(seeds.map((seed) => signature(cachedPlay(mod, seed, 'full', 'plain', maxStepsOf(options)))));
  const needed = Math.min(3, seeds.length);
  report('seeds', distinct.size >= needed ? [] : [`only ${distinct.size} distinct games for ${seeds.length} seeds (need ${needed}): the seed must change what happens`]);
}

/** One buff of each kind, for probing which kinds a game uses. */
export const PROBE_BUFFS: Record<RunBuffKind, number> = { attack: 15, defense: 15, time: 20, hint: 2, revive: 1, luck: 15 };

/** The buff kinds that change at least one game, for the docs. `runs.buffed` is tried as well. */
export function honouredBuffKinds<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): RunBuffKind[] {
  const mod = asAny(module);
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const plain = seeds.map((seed) => signature(cachedPlay(mod, seed, 'full', 'plain', maxSteps)));
  return BUFF_KINDS.filter((kind) => {
    const run: RunContext = { ...runs.plain, buffs: [{ id: `probe-${kind}`, kind, amount: PROBE_BUFFS[kind] }] };
    return seeds.some((seed, i) => signature(cachedPlay(mod, seed, 'full', run, maxSteps)) !== plain[i]);
  });
}

/** `runs.buffed` (or, failing that, a single buff of any kind) changes at least one game, unless `ignoresBuffs` gives a reason. */
export function checkBuffsHonoured<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  if (options.ignoresBuffs !== undefined) {
    report('buffs', options.ignoresBuffs.trim().length >= 10 ? [] : ['ignoresBuffs needs a real reason (at least 10 characters)']);
    return;
  }
  const mod = asAny(module);
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const buffedChanges = seeds.some(
    (seed) => signature(cachedPlay(mod, seed, 'full', 'buffed', maxSteps)) !== signature(cachedPlay(mod, seed, 'full', 'plain', maxSteps)),
  );
  if (buffedChanges || honouredBuffKinds(module, options).length > 0) return;
  report('buffs', [
    `no buff changed any of the ${seeds.length} games (runs.buffed, then one buff of each kind: ${BUFF_KINDS.join(', ')}). ` +
      "Read them with buffAmount(run, kind), or declare { ignoresBuffs: 'why' } and say so in docs/games/<id>.md",
  ]);
}

/** `parties.full` and `parties.starter` play differently on at least one seed, unless `ignoresParty` gives a reason. */
export function checkPartyHonoured<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  if (options.ignoresParty !== undefined) {
    report('party', options.ignoresParty.trim().length >= 10 ? [] : ['ignoresParty needs a real reason (at least 10 characters)']);
    return;
  }
  const mod = asAny(module);
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const differs = seeds.some(
    (seed) => signature(cachedPlay(mod, seed, 'full', 'plain', maxSteps)) !== signature(cachedPlay(mod, seed, 'starter', 'plain', maxSteps)),
  );
  report('party', differs ? [] : [
    `parties.full (level 12) and parties.starter (level 1) played identically on all ${seeds.length} seeds. ` +
      "Use the members (power, habit, traits), or declare { ignoresParty: 'why' } and explain how the party matters in docs/games/<id>.md",
  ]);
}

/** The bot wins at least one of the games with `parties.full` on `runs.plain`: the game is winnable and the bot is competent. */
export function checkBotWins<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const seeds = seedsOf(options);
  const results = seeds.map((seed) => cachedPlay(mod, seed, 'full', 'plain', maxStepsOf(options)).outcome?.result ?? 'unfinished');
  report('bot', results.includes('won') ? [] : [`the bot never won with parties.full on runs.plain (results: ${results.join(', ')}); make botPlay competent`]);
}

/** Every check, in the order `describeGameContract` runs them. */
export const CONTRACT_CHECKS = {
  manifest: (m: AnyModule, o: ContractOptions) => checkManifest(m, o.folder),
  strings: (m: AnyModule) => checkStrings(m),
  determinism: checkDeterminism,
  termination: checkTermination,
  purity: checkPurity,
  outcomes: checkOutcomes,
  seeds: checkSeedsDiffer,
  buffs: checkBuffsHonoured,
  party: checkPartyHonoured,
  bot: checkBotWins,
} as const;
