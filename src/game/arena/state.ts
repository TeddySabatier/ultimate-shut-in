/**
 * Arena save state: the empty state a new save starts with, the tolerant
 * reader that migration runs on a stored `arena` (`docs/design/ARENA.md` 6),
 * and small selectors shared by the other arena modules.
 */
import { arenaContent, getArenaBuff, getArenaItem, getCombo } from '../content';
import { clamp } from '../draft';
import { gameDayIndex, type TimeOptions } from '../time';
import type {
  ArenaBankChoice,
  ArenaBuff,
  ArenaDifficulty,
  ArenaEnd,
  ArenaGameRecord,
  ArenaGameResult,
  ArenaLearned,
  ArenaPhase,
  ArenaRequest,
  ArenaRun,
  ArenaRunRecord,
  ArenaState,
  GearSlot,
  HabitId,
  RingId,
  SaveFile,
} from '../types';
import { ARENA_BUFF_KINDS, GEAR_SLOTS, HABIT_IDS } from '../types';

/** A request shorter than this is refused (the upper limit is `requests.textMax` in the content). */
export const REQUEST_MIN_LENGTH = 3;

function emptyGear(): Record<GearSlot, string | null> {
  return { weapon: null, armor: null, charm: null };
}

export function emptyArena(): ArenaState {
  const gear = {} as Record<HabitId, Record<GearSlot, string | null>>;
  const training = {} as Record<HabitId, number>;
  for (const h of HABIT_IDS) {
    gear[h] = emptyGear();
    training[h] = 0;
  }
  return {
    gear,
    stash: [],
    training,
    trainingWeek: { period: 0, spent: 0, bumps: 0 },
    decor: [],
    defense: null,
    run: null,
    log: [],
    stats: { runs: 0, gamesWon: 0, gamesLost: 0, bestChain: 0, coinsBanked: 0 },
    today: { day: 0, runs: 0 },
    requests: [],
    nextSeq: 1,
  };
}

/** Game day of `now` for this save's reset hour. */
export function dayOf(save: Pick<SaveFile, 'settings'>, now: number, opts?: TimeOptions): number {
  return gameDayIndex(now, save.settings.resetHour, opts?.tz);
}

/** Wave defense the Arena adds to the wave of `period` (0 when none was banked for it). */
export function arenaDefense(save: Pick<SaveFile, 'arena' | 'week'>, period: number = save.week.index): number {
  const d = save.arena.defense;
  return d !== null && d.period === period ? d.amount : 0;
}

/** Runs started today (the counter resets with the game day). */
export function runsToday(save: Pick<SaveFile, 'arena'>, day: number): number {
  return save.arena.today.day === day ? save.arena.today.runs : 0;
}

/** True once the player passed the suggested number of runs for today. Never a block. */
export function overDailySuggestion(save: Pick<SaveFile, 'arena'>, day: number): boolean {
  return runsToday(save, day) >= arenaContent.run.suggestedRunsPerDay;
}

/** Sum of the amounts of the run's buffs of one kind. */
export function runBuffTotal(buffs: readonly ArenaBuff[], kind: ArenaBuff['kind']): number {
  let total = 0;
  for (const b of buffs) if (b.kind === kind) total += b.amount;
  return total;
}

/** Every rare item the player owns, worn or in the stash. */
export function ownedRareItems(arena: ArenaState): string[] {
  const out = new Set<string>(arena.stash);
  for (const h of HABIT_IDS) {
    for (const slot of GEAR_SLOTS) {
      const id = arena.gear[h][slot];
      if (id !== null && getArenaItem(id)?.rare === true) out.add(id);
    }
  }
  return [...out];
}

/* ------------------------------ Migration ------------------------------ */

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return clamp(Math.floor(num(v, fallback)), min, max);
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

const PHASES: readonly ArenaPhase[] = ['playing', 'lottery', 'decide'];
const RESULTS: readonly ArenaGameResult[] = ['won', 'lost', 'fled'];
const ENDS: readonly ArenaEnd[] = ['lost', 'fled', 'banked'];
const BANKS: readonly ArenaBankChoice[] = ['coins', 'defense', 'item'];

/** A localized pair with both languages non-empty, or null. */
function localized(v: unknown, max: number): { en: string; fr: string } | null {
  if (!isDict(v)) return null;
  const en = text(v.en, max);
  const fr = text(v.fr, max);
  return en !== '' && fr !== '' ? { en, fr } : null;
}

export function sanitizeLearned(v: unknown): ArenaLearned | undefined {
  if (!isDict(v)) return undefined;
  const topic = localized(v.topic, 80);
  const note = localized(v.note, arenaContent.log.noteMax);
  return topic && note ? { topic, note } : undefined;
}

function migrateGame(raw: unknown): ArenaGameRecord | null {
  if (!isDict(raw) || typeof raw.gameId !== 'string' || raw.gameId === '') return null;
  const result = oneOf(raw.result, RESULTS);
  if (!result) return null;
  const rec: ArenaGameRecord = {
    gameId: raw.gameId.slice(0, 32),
    room: int(raw.room, 0, 0, 99),
    result,
    score: int(raw.score, 0, 0, 1000),
    coins: int(raw.coins, 0, 0, 1_000_000),
  };
  const learned = sanitizeLearned(raw.learned);
  if (learned) rec.learned = learned;
  return rec;
}

function migrateGames(raw: unknown): ArenaGameRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ArenaGameRecord[] = [];
  for (const g of raw) {
    const m = migrateGame(g);
    if (m) out.push(m);
  }
  return out.slice(-arenaContent.run.maxRooms - 1);
}

function migrateBuff(raw: unknown): ArenaBuff | null {
  if (!isDict(raw) || typeof raw.id !== 'string') return null;
  const kind = oneOf(raw.kind, ARENA_BUFF_KINDS);
  const def = getArenaBuff(raw.id.split('@')[0] ?? '');
  if (!kind || !def || def.kind !== kind) return null;
  return { id: raw.id, kind, amount: def.amount };
}

function migrateBuffs(raw: unknown): ArenaBuff[] {
  if (!Array.isArray(raw)) return [];
  const out: ArenaBuff[] = [];
  for (const b of raw) {
    const m = migrateBuff(b);
    if (m && !out.some((x) => x.id === m.id)) out.push(m);
  }
  return out;
}

function migrateRun(raw: unknown): ArenaRun | null {
  if (!isDict(raw) || typeof raw.id !== 'string' || !/^r[1-9]\d*$/.test(raw.id)) return null;
  const phase = oneOf(raw.phase, PHASES);
  if (!phase) return null;
  const cur = isDict(raw.current) ? raw.current : null;
  const current =
    cur && typeof cur.gameId === 'string' && cur.gameId !== ''
      ? {
          gameId: cur.gameId.slice(0, 32),
          seed: Math.floor(num(cur.seed, 0)) >>> 0,
          roomIndex: int(cur.roomIndex, 0, 0, 99),
          difficulty: int(cur.difficulty, 1, 1, 5) as ArenaDifficulty,
        }
      : null;
  if (phase === 'playing' && current === null) return null;
  const offers = migrateBuffs(raw.offers);
  if (phase === 'lottery' && offers.length === 0) return null;
  const pend = isDict(raw.pending) ? raw.pending : {};
  const lastGameId = typeof raw.lastGameId === 'string' ? raw.lastGameId.slice(0, 32) : null;
  return {
    id: raw.id,
    seed: Math.floor(num(raw.seed, 0)) >>> 0,
    startedDay: Math.floor(num(raw.startedDay, 0)),
    startedAt: num(raw.startedAt, 0),
    ring: int(raw.ring, 1, 1, 7) as RingId,
    fee: int(raw.fee, 0, 0, 10_000),
    phase,
    room: int(raw.room, 0, 0, arenaContent.run.maxRooms),
    buffs: migrateBuffs(raw.buffs),
    pending: { coins: int(pend.coins, 0, 0, 1_000_000), wins: int(pend.wins, 0, 0, arenaContent.run.maxRooms) },
    current: phase === 'playing' ? current : null,
    offers: phase === 'lottery' ? offers : [],
    games: migrateGames(raw.games),
    lastGameId,
  };
}

function migrateRecord(raw: unknown): ArenaRunRecord | null {
  if (!isDict(raw) || typeof raw.id !== 'string') return null;
  const end = oneOf(raw.end, ENDS);
  if (!end) return null;
  const bank = oneOf(raw.bank, BANKS);
  const itemId = typeof raw.itemId === 'string' && getArenaItem(raw.itemId) ? raw.itemId : null;
  return {
    id: raw.id,
    day: Math.floor(num(raw.day, 0)),
    at: num(raw.at, 0),
    ring: int(raw.ring, 1, 1, 7) as RingId,
    fee: int(raw.fee, 0, 0, 10_000),
    wins: int(raw.wins, 0, 0, arenaContent.run.maxRooms),
    end,
    bank: end === 'banked' ? (bank ?? 'coins') : null,
    coins: int(raw.coins, 0, 0, 1_000_000),
    defense: int(raw.defense, 0, 0, arenaContent.bank.defenseCapPerPeriod),
    itemId,
    games: migrateGames(raw.games),
  };
}

function migrateRequests(raw: unknown): ArenaRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: ArenaRequest[] = [];
  for (const r of raw) {
    if (!isDict(r) || typeof r.id !== 'string' || out.some((x) => x.id === r.id)) continue;
    const body = text(r.text, arenaContent.requests.textMax);
    if (body.length < REQUEST_MIN_LENGTH) continue;
    out.push({ id: r.id, at: num(r.at, 0), day: Math.floor(num(r.day, 0)), text: body, source: r.source === 'voice' ? 'voice' : 'text' });
  }
  return out.slice(-arenaContent.requests.keep);
}

/** The highest sequence number a stored id (`r12`, `q7`) carries. */
function maxSeq(ids: readonly string[]): number {
  let max = 0;
  for (const id of ids) {
    const n = Number(id.slice(1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

/**
 * Normalise a stored `arena` the way boards and maps are: drop what cannot be
 * trusted (unknown items, a run in an impossible phase), clamp numbers, keep
 * the caps. A save with no `arena` (v4 and older) gets the empty state.
 */
export function migrateArena(raw: unknown): ArenaState {
  const arena = emptyArena();
  if (!isDict(raw)) return arena;

  const gearRaw = isDict(raw.gear) ? raw.gear : {};
  const worn = new Set<string>();
  for (const h of HABIT_IDS) {
    const g = isDict(gearRaw[h]) ? (gearRaw[h] as Dict) : {};
    for (const slot of GEAR_SLOTS) {
      const id = g[slot];
      const item = typeof id === 'string' ? getArenaItem(id) : undefined;
      if (item && item.slot === slot && !worn.has(item.id)) {
        arena.gear[h][slot] = item.id;
        // Sold items can be worn by many vassals; a rare one only by one.
        if (item.rare === true) worn.add(item.id);
      }
    }
  }
  if (Array.isArray(raw.stash)) {
    for (const id of raw.stash) {
      const item = typeof id === 'string' ? getArenaItem(id) : undefined;
      if (item?.rare === true && !worn.has(item.id) && !arena.stash.includes(item.id)) arena.stash.push(item.id);
    }
  }
  const trainRaw = isDict(raw.training) ? raw.training : {};
  for (const h of HABIT_IDS) arena.training[h] = int(trainRaw[h], 0, 0, arenaContent.training.bumpPower.length);
  const tw = isDict(raw.trainingWeek) ? raw.trainingWeek : {};
  arena.trainingWeek = { period: int(tw.period, 0, 0, 1_000_000), spent: int(tw.spent, 0, 0, 1_000_000), bumps: int(tw.bumps, 0, 0, 1000) };
  if (Array.isArray(raw.decor)) {
    for (const id of raw.decor) if (typeof id === 'string' && getCombo(id) && !arena.decor.includes(id)) arena.decor.push(id);
  }
  const d = isDict(raw.defense) ? raw.defense : null;
  if (d) {
    const amount = int(d.amount, 0, 0, arenaContent.bank.defenseCapPerPeriod);
    if (amount > 0) arena.defense = { period: int(d.period, 0, 0, 1_000_000), amount };
  }
  arena.run = migrateRun(raw.run);
  if (Array.isArray(raw.log)) {
    for (const r of raw.log) {
      const m = migrateRecord(r);
      if (m) arena.log.push(m);
    }
    arena.log = arena.log.slice(-arenaContent.log.keep);
  }
  const s = isDict(raw.stats) ? raw.stats : {};
  arena.stats = {
    runs: int(s.runs, 0, 0, 10_000_000),
    gamesWon: int(s.gamesWon, 0, 0, 10_000_000),
    gamesLost: int(s.gamesLost, 0, 0, 10_000_000),
    bestChain: int(s.bestChain, 0, 0, arenaContent.run.maxRooms),
    coinsBanked: int(s.coinsBanked, 0, 0, 1_000_000_000),
  };
  const t = isDict(raw.today) ? raw.today : {};
  arena.today = { day: Math.floor(num(t.day, 0)), runs: int(t.runs, 0, 0, 10_000) };
  arena.requests = migrateRequests(raw.requests);
  arena.nextSeq = Math.max(1, Math.floor(num(raw.nextSeq, 1)), maxSeq([...(arena.run ? [arena.run.id] : []), ...arena.log.map((r) => r.id), ...arena.requests.map((r) => r.id)]) + 1);
  return arena;
}
