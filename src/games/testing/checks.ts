/**
 * The contract checks every game must pass, as plain functions. Each one
 * throws a `ContractViolation` listing every problem it found, or returns
 * quietly. `describeGameContract` (./contract.ts) wraps them in vitest tests;
 * the kit's own tests call them directly on deliberately broken games.
 *
 * Every bot play the checks share is played on deep-frozen states and
 * actions, with a plain-data check on every state of the first 200 steps,
 * then every 10th, and on every action.
 *
 * No vitest import here.
 */
import {
  BUFF_KINDS,
  GAME_CATEGORIES,
  GAME_ID_PATTERN,
  LOCALES,
  RESERVED_FOLDERS,
  fitParty,
  type GameModule,
  type Locale,
  type Party,
  type RunBuffKind,
  type RunContext,
} from '../contract';
import { parties, runs, type PartyName, type RunName } from './fixtures';
import { DEFAULT_MAX_STEPS, playToEnd, type PlayResult } from './play';
import { isRecord, localizedProblems, nonEmptyString, outcomeProblems, plainDataProblems } from './validate';

export { outcomeProblems, plainDataProblems } from './validate';

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

function seedsOf(options: ContractOptions): readonly number[] {
  return options.seeds ?? DEFAULT_SEEDS;
}

function maxStepsOf(options: ContractOptions): number {
  return options.maxSteps ?? DEFAULT_MAX_STEPS;
}

/** The parties a game is played with: full, starter and mixed always, single when one member is enough. */
export function contractParties(module: AnyModule): PartyName[] {
  const names: PartyName[] = ['full', 'starter', 'mixed'];
  if (module.manifest.rosterSize.min <= 1) names.push('single');
  return names;
}

function partyFor(module: AnyModule, name: PartyName): Party {
  return fitParty(parties[name], module.manifest);
}

/** One case of the play matrix. */
interface Case {
  seed: number;
  party: PartyName;
  run: RunName | RunContext;
  locale: Locale;
}

function runOf(c: Case): RunContext {
  return typeof c.run === 'string' ? runs[c.run] : c.run;
}

function label(c: Case): string {
  return `seed ${c.seed}, parties.${c.party}, ${typeof c.run === 'string' ? `runs.${c.run}` : 'a probe run'}, ${c.locale}`;
}

interface CachedPlay {
  result?: PlayResult<unknown, unknown>;
  error?: unknown;
  /** Plain-data problems seen in the states and actions of the play. */
  data: string[];
}

// One frozen play per (module, case, maxSteps), shared by the checks.
const playCache = new WeakMap<object, Map<string, CachedPlay>>();

function cachedPlay(module: AnyModule, c: Case, maxSteps: number): CachedPlay {
  let byKey = playCache.get(module);
  if (!byKey) {
    byKey = new Map();
    playCache.set(module, byKey);
  }
  const key = `${c.seed}|${c.party}|${typeof c.run === 'string' ? c.run : stableStringify(c.run)}|${c.locale}|${maxSteps}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const data: string[] = [];
  let entry: CachedPlay;
  try {
    const result = playToEnd(module, c.seed, partyFor(module, c.party), runOf(c), maxSteps, {
      freeze: true,
      locale: c.locale,
      inspect: (state, step) => {
        if (data.length === 0 && (step < 200 || step % 10 === 0)) plainDataProblems(state, `state (step ${step})`, data);
      },
    });
    if (data.length === 0) plainDataProblems(result.state, 'final state', data);
    for (let i = 0; i < result.actions.length && data.length === 0; i++) plainDataProblems(result.actions[i], `action ${i}`, data);
    entry = { result, data };
  } catch (error) {
    entry = { error, data };
  }
  byKey.set(key, entry);
  return entry;
}

/** The result of a cached play, or a thrown Error naming the case. */
function played(module: AnyModule, c: Case, maxSteps: number): PlayResult<unknown, unknown> {
  const p = cachedPlay(module, c, maxSteps);
  if (!p.result) throw new Error(`${label(c)}: engine threw ${message(p.error)}`);
  return p.result;
}

/** What a play looks like from outside: the actions taken and the outcome. */
function signature(r: PlayResult<unknown, unknown>): string {
  return stableStringify({ actions: r.actions, outcome: r.outcome });
}

/**
 * The play matrix: in English, 5 seeds with every party on `runs.plain`, plus the full party
 * on `runs.buffed` and `runs.hard`; in French, 5 seeds with every party on `runs.plain`.
 */
export function playMatrix(mod: AnyModule, options: ContractOptions): Case[] {
  const cases: Case[] = [];
  for (const locale of LOCALES) {
    for (const seed of seedsOf(options)) {
      for (const party of contractParties(mod)) cases.push({ seed, party, run: 'plain', locale });
      if (locale === 'en') cases.push({ seed, party: 'full', run: 'buffed', locale }, { seed, party: 'full', run: 'hard', locale });
    }
  }
  return cases;
}

function guarded(check: string, fn: () => string[]): void {
  let problems: string[];
  try {
    problems = fn();
  } catch (e) {
    problems = [message(e)];
  }
  report(check, problems);
}

// ---------------------------------------------------------------------------
// 1. Manifest
// ---------------------------------------------------------------------------

const MANIFEST_KEYS = ['id', 'name', 'tagline', 'category', 'minRing', 'rosterSize', 'estMinutes', 'supportsReducedMotion', 'learning', 'devOnly'];

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
  else {
    for (const fn of ['initial', 'reduce', 'outcome', 'botPlay']) if (typeof engine[fn] !== 'function') problems.push(`engine.${fn} must be a function`);
    if (engine.forfeit !== undefined && typeof engine.forfeit !== 'function') problems.push('engine.forfeit must be a function when present');
  }
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
  if (Array.isArray(en) !== Array.isArray(fr)) out.push(`${path}: an array in one language and not in the other`);
  else if (Array.isArray(en) && Array.isArray(fr) && en.length !== fr.length) out.push(`${path}: ${en.length} entries in en but ${fr.length} in fr (index lookups would break)`);
  leafProblems(en, `en.${path}`, out);
  leafProblems(fr, `fr.${path}`, out);
  const a = placeholders(en);
  const b = placeholders(fr);
  if (a !== b) out.push(`${path}: placeholders differ (en {${a}} vs fr {${b}})`);
}

/** Same key tree in en and fr, same array lengths, string (or string array) leaves, nothing empty, same `{placeholders}`. */
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

/** Two fresh plays from the same seed, party, run and locale are identical: states, actions, outcome. In en and fr. */
export function checkDeterminism<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const s0 = seeds[0] ?? 1;
  const s1 = seeds[1] ?? 2;
  const cases: Case[] = [
    { seed: s0, party: 'full', run: 'plain', locale: 'en' },
    { seed: s1, party: 'starter', run: 'plain', locale: 'en' },
    { seed: s0, party: 'full', run: 'buffed', locale: 'en' },
    { seed: s0, party: 'full', run: 'plain', locale: 'fr' },
    { seed: s1, party: 'mixed', run: 'plain', locale: 'fr' },
  ];
  for (const c of cases) {
    const where = label(c);
    try {
      const p = partyFor(mod, c.party);
      const run = runOf(c);
      const init = firstDifference(mod.engine.initial(c.seed, p, run, c.locale), mod.engine.initial(c.seed, p, run, c.locale), 'initial');
      if (init) {
        problems.push(`${where}: initial() differs between two calls at ${init} (randomness must come from the seed only)`);
        continue;
      }
      const a = playToEnd(mod, c.seed, p, run, maxSteps, { locale: c.locale });
      const b = playToEnd(mod, c.seed, p, run, maxSteps, { locale: c.locale });
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

/**
 * The bot finishes every game of the play matrix within `maxSteps`; `botPlay`
 * returns null exactly when the game is over; a finished game stays finished
 * with the same outcome.
 */
export function checkTermination<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const maxSteps = maxStepsOf(options);
  for (const c of playMatrix(mod, options)) {
    const where = label(c);
    try {
      const start = mod.engine.initial(c.seed, partyFor(mod, c.party), runOf(c), c.locale);
      if (mod.engine.outcome(start) !== null) {
        problems.push(`${where}: outcome(initial) must be null (the game has not started)`);
        continue;
      }
      const r = played(mod, c, maxSteps);
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
 * Every play of the matrix runs on deep-frozen states and actions: the
 * engine must neither throw nor mutate. States (every one of the first 200
 * steps, then every 10th) and every action must be plain JSON data. A frozen
 * play equals an unfrozen one.
 */
export function checkPurity<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const maxSteps = maxStepsOf(options);
  for (const c of playMatrix(mod, options)) {
    const p = cachedPlay(mod, c, maxSteps);
    if (p.error !== undefined) problems.push(`${label(c)}: threw while playing on deep-frozen states, so it mutates its input (or crashes): ${message(p.error)}`);
    for (const d of p.data) problems.push(`${label(c)}: ${d}`);
  }
  const seeds = seedsOf(options);
  for (const c of [
    { seed: seeds[0] ?? 1, party: 'full', run: 'plain', locale: 'en' },
    { seed: seeds[1] ?? 2, party: 'starter', run: 'buffed', locale: 'fr' },
  ] satisfies Case[]) {
    const frozen = cachedPlay(mod, c, maxSteps).result;
    if (!frozen) continue;
    try {
      const loose = playToEnd(mod, c.seed, partyFor(mod, c.party), runOf(c), maxSteps, { locale: c.locale });
      const d = firstDifference(frozen.state, loose.state, 'final state') ?? firstDifference(frozen.outcome, loose.outcome, 'outcome');
      if (d) problems.push(`${label(c)}: a frozen play and a normal play differ at ${d}`);
    } catch (e) {
      problems.push(`${label(c)}: engine threw ${message(e)}`);
    }
  }
  report('purity', problems);
}

// ---------------------------------------------------------------------------
// 6. Outcomes
// ---------------------------------------------------------------------------

/**
 * Every outcome of the play matrix is valid. When the engine has `forfeit`,
 * leaving at the start and halfway through a game must end it as `fled` with
 * a valid outcome too (the bot never leaves, so this path is checked apart).
 */
export function checkOutcomes<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  const problems: string[] = [];
  const maxSteps = maxStepsOf(options);
  for (const c of playMatrix(mod, options)) {
    const where = label(c);
    const p = cachedPlay(mod, c, maxSteps);
    if (!p.result) {
      problems.push(`${where}: engine threw ${message(p.error)}`);
      continue;
    }
    if (!p.result.outcome) {
      problems.push(`${where}: the game did not end (see the termination check)`);
      continue;
    }
    const ids = partyFor(mod, c.party).members.map((m) => m.id);
    for (const o of outcomeProblems(p.result.outcome, ids)) problems.push(`${where}: ${o}`);
  }

  const forfeit = mod.engine.forfeit;
  if (forfeit) {
    for (const seed of seedsOf(options)) {
      for (const party of ['full', 'starter'] as const) {
        const c: Case = { seed, party, run: 'plain', locale: 'en' };
        const p = cachedPlay(mod, c, maxSteps);
        if (!p.result) continue;
        const ids = partyFor(mod, party).members.map((m) => m.id);
        const half = Math.floor(p.result.actions.length / 2);
        for (const at of [0, half]) {
          const where = `${label(c)}, forfeit at step ${at}`;
          try {
            let state = mod.engine.initial(seed, partyFor(mod, party), runOf(c), c.locale);
            for (const a of p.result.actions.slice(0, at)) state = mod.engine.reduce(state, a);
            if (mod.engine.outcome(state)) continue;
            const o = mod.engine.outcome(mod.engine.reduce(state, forfeit.call(mod.engine, state)));
            if (!o) problems.push(`${where}: reducing engine.forfeit(state) must end the game`);
            else {
              if (o.result !== 'fled') problems.push(`${where}: a forfeit must end as fled (got ${o.result})`);
              for (const x of outcomeProblems(o, ids)) problems.push(`${where}: ${x}`);
            }
          } catch (e) {
            problems.push(`${where}: engine threw ${message(e)}`);
          }
        }
      }
    }
  }
  report('outcomes', problems);
}

// ---------------------------------------------------------------------------
// 7. Seeds, buffs, party, bot
// ---------------------------------------------------------------------------

const plainCase = (seed: number, party: PartyName = 'full', run: RunName | RunContext = 'plain'): Case => ({ seed, party, run, locale: 'en' });

/** At least 3 of the 5 seeds give different games (the bot's actions and the outcome, not just a stored number). */
export function checkSeedsDiffer<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  guarded('seeds', () => {
    const seeds = seedsOf(options);
    const distinct = new Set(seeds.map((seed) => signature(played(mod, plainCase(seed), maxStepsOf(options)))));
    const needed = Math.min(3, seeds.length);
    return distinct.size >= needed ? [] : [`only ${distinct.size} distinct games for ${seeds.length} seeds (need ${needed}): the seed must change what happens`];
  });
}

/** One buff of each kind, for probing which kinds a game uses. */
export const PROBE_BUFFS: Record<RunBuffKind, number> = { attack: 15, defense: 15, time: 20, hint: 2, revive: 1, luck: 15 };

/** The buff kinds that change at least one game, for the docs. */
export function honouredBuffKinds<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): RunBuffKind[] {
  const mod = asAny(module);
  const seeds = seedsOf(options);
  const maxSteps = maxStepsOf(options);
  const plain = seeds.map((seed) => signature(played(mod, plainCase(seed), maxSteps)));
  return BUFF_KINDS.filter((kind) => {
    const run: RunContext = { ...runs.plain, buffs: [{ id: `probe-${kind}`, kind, amount: PROBE_BUFFS[kind] }] };
    return seeds.some((seed, i) => signature(played(mod, plainCase(seed, 'full', run), maxSteps)) !== plain[i]);
  });
}

/** `runs.buffed` (or, failing that, a single buff of any kind) changes at least one game, unless `ignoresBuffs` gives a reason. */
export function checkBuffsHonoured<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  if (options.ignoresBuffs !== undefined) {
    report('buffs', options.ignoresBuffs.trim().length >= 10 ? [] : ['ignoresBuffs needs a real reason (at least 10 characters)']);
    return;
  }
  const mod = asAny(module);
  guarded('buffs', () => {
    const seeds = seedsOf(options);
    const maxSteps = maxStepsOf(options);
    const buffedChanges = seeds.some((seed) => signature(played(mod, plainCase(seed, 'full', 'buffed'), maxSteps)) !== signature(played(mod, plainCase(seed), maxSteps)));
    if (buffedChanges || honouredBuffKinds(module, options).length > 0) return [];
    return [
      `no buff changed any of the ${seeds.length} games (runs.buffed, then one buff of each kind: ${BUFF_KINDS.join(', ')}). ` +
        "Read them with buffAmount(run, kind), or declare { ignoresBuffs: 'why' } and say so in docs/games/<id>.md",
    ];
  });
}

/** `parties.full` and `parties.starter` play differently on at least one seed, unless `ignoresParty` gives a reason. */
export function checkPartyHonoured<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  if (options.ignoresParty !== undefined) {
    report('party', options.ignoresParty.trim().length >= 10 ? [] : ['ignoresParty needs a real reason (at least 10 characters)']);
    return;
  }
  const mod = asAny(module);
  guarded('party', () => {
    const seeds = seedsOf(options);
    const maxSteps = maxStepsOf(options);
    const differs = seeds.some((seed) => signature(played(mod, plainCase(seed), maxSteps)) !== signature(played(mod, plainCase(seed, 'starter'), maxSteps)));
    return differs
      ? []
      : [
          `parties.full (level 12) and parties.starter (level 1) played identically on all ${seeds.length} seeds. ` +
            "Use the members (power, habit, traits), or declare { ignoresParty: 'why' } and explain how the party matters in docs/games/<id>.md",
        ];
  });
}

/** The bot wins at least one of the games with `parties.full` on `runs.plain`: the game is winnable and the bot is competent. */
export function checkBotWins<S, A>(module: GameModule<S, A>, options: ContractOptions = {}): void {
  const mod = asAny(module);
  guarded('bot', () => {
    const seeds = seedsOf(options);
    const results = seeds.map((seed) => played(mod, plainCase(seed), maxStepsOf(options)).outcome?.result ?? 'unfinished');
    return results.includes('won') ? [] : [`the bot never won with parties.full on runs.plain (results: ${results.join(', ')}); make botPlay competent`];
  });
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
