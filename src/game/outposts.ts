/**
 * Outposts: the player's own named places on the City Map
 * (docs/design/CITY-MAP.md section 3 and 4.3). Every mutator follows the
 * engine contract; refusals use short codes whose warm copy lives in
 * `strings.json` under `map.errors`.
 *
 * Rules in one place: one counted visit per outpost per game day, four
 * states reached at 0 / 3 / 10 / 30 visits that never drop (`peak`), quiet
 * after 14 days without a visit (7 if never visited), caps of 3 + ring
 * active outposts, 3 per zone, 3 cells apart, none in the Room. Visits pay
 * nothing themselves; the states pay small perks read by `board.ts`,
 * `economy.ts` and `wave.ts`.
 */
import { getOutpostType, outpostRules, outpostStates } from './content';
import { clone, ok, pushLog, refuse } from './draft';
import { canHoldOutpost, compassVector, cellDistance, isIslandCell, islandCells, zoneOfCell, ZONE_RADII } from './mapGeometry';
import { gameDayIndex, type TimeOptions } from './time';
import type { ActionResult, Compass, GameEvent, HabitId, MapCell, Outpost, OutpostState, OutpostTypeId, OutpostVisit, SaveFile, VisitSource } from './types';
import { HABIT_IDS, OUTPOST_STATES, OUTPOST_TYPE_IDS } from './types';

export const OUTPOST_NAME_MAX = outpostRules.nameMax;
export const OUTPOST_NOTE_MAX = outpostRules.noteMax;
export const OUTPOST_MIN_SPACING = outpostRules.minSpacing;
export const OUTPOST_PER_ZONE = outpostRules.perZone;
export const VISIT_LOG_MAX = outpostRules.visitLogMax;

/* ------------------------------ Selectors ------------------------------ */

const STATE_RANK: Record<OutpostState, number> = { marked: 0, scouted: 1, corridor: 2, stronghold: 3 };

/** The state `visits` counted visits earn (3.3). */
export function outpostStateFor(visits: number): OutpostState {
  let s: OutpostState = 'marked';
  for (const def of outpostStates) if (visits >= def.minVisits) s = def.id;
  return s;
}

/** The next state above `state`, or null at Stronghold. */
export function nextOutpostState(state: OutpostState): { id: OutpostState; minVisits: number; label: string } | null {
  const i = OUTPOST_STATES.indexOf(state);
  const def = outpostStates[i + 1];
  return def ? { id: def.id, minVisits: def.minVisits, label: def.label } : null;
}

export function outpostStateAtLeast(state: OutpostState, min: OutpostState): boolean {
  return STATE_RANK[state] >= STATE_RANK[min];
}

export function higherState(a: OutpostState, b: OutpostState): OutpostState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

export function outpostZone(cell: MapCell): number {
  return zoneOfCell(cell);
}

/** Active outposts allowed at a ring: 3 + ring, at most 10 (3.5). */
export function outpostCap(ring: number): number {
  return Math.min(outpostRules.maxCap, outpostRules.baseCap + outpostRules.capPerRing * ring);
}

export function activeOutposts(save: Pick<SaveFile, 'map'>): Outpost[] {
  return save.map.outposts.filter((o) => !o.retired);
}

export function findOutpost(save: Pick<SaveFile, 'map'>, id: string): Outpost | undefined {
  return save.map.outposts.find((o) => o.id === id);
}

/** Quiet: no visit for 14 game days, or none 7 days after creation (3.6). Changes nothing but the look. */
export function isOutpostQuiet(outpost: Pick<Outpost, 'lastVisitDay' | 'createdDay'>, today: number): boolean {
  if (outpost.lastVisitDay === null) return today - outpost.createdDay >= outpostRules.quietIfNeverVisitedAfterDays;
  return today - outpost.lastVisitDay >= outpostRules.quietAfterDays;
}

/** Reroll discount for a habit: 5 when any active outpost related to it is Scouted or better (best outpost wins). */
export function outpostRerollDiscount(save: Pick<SaveFile, 'map'>, habit: HabitId): number {
  return activeOutposts(save).some((o) => o.habits.includes(habit) && outpostStateAtLeast(o.peak, 'scouted')) ? outpostRules.rerollDiscount : 0;
}

/** Settlement multiplier term for a habit: +0.10 when any related active outpost is a Corridor or better; never stacked. */
export function outpostCoinMult(save: Pick<SaveFile, 'map'>, habit: HabitId): number {
  return activeOutposts(save).some((o) => o.habits.includes(habit) && outpostStateAtLeast(o.peak, 'corridor')) ? outpostRules.corridorCoinMult : 0;
}

/** Wave defense from Strongholds: +2 each, capped at +6 (3.3). */
export function outpostDefense(save: Pick<SaveFile, 'map'>): number {
  const n = activeOutposts(save).filter((o) => o.peak === 'stronghold').length;
  return Math.min(outpostRules.strongholdDefenseCap, n * outpostRules.strongholdDefense);
}

/** Strongholds that count in the wave, in creation order, for the battle log. */
export function strongholdOutposts(save: Pick<SaveFile, 'map'>): Outpost[] {
  return activeOutposts(save).filter((o) => o.peak === 'stronghold');
}

/** Counted visit logged for an outpost on `day`, if any. */
export function countedVisitOn(save: Pick<SaveFile, 'map'>, outpostId: string, day: number): OutpostVisit | undefined {
  return save.map.visits.find((v) => v.outpostId === outpostId && v.day === day && v.counted);
}

export function visitForQuest(save: Pick<SaveFile, 'map'>, instanceId: string): OutpostVisit | undefined {
  return save.map.visits.find((v) => v.instanceId === instanceId);
}

/** Active outposts related to a habit, most visited first (the settlement window's "Where were you?"). */
export function relatedOutposts(save: Pick<SaveFile, 'map'>, habit: HabitId): Outpost[] {
  return activeOutposts(save)
    .filter((o) => o.habits.includes(habit))
    .sort((a, b) => b.visits - a.visits || a.id.localeCompare(b.id));
}

function cellsApart(a: MapCell, b: MapCell): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Free cell in `zone` nearest the compass ray and the zone's middle radius,
 * keeping the spacing from every active outpost (`except` one being moved),
 * or null when the zone has no room that way.
 */
export function suggestOutpostCell(save: Pick<SaveFile, 'map'>, zone: number, dir: Compass, except?: string): MapCell | null {
  if (!Number.isInteger(zone) || zone < 2 || zone > 7) return null;
  const u = compassVector(dir);
  const mid = (ZONE_RADII[zone - 2]! + ZONE_RADII[zone - 1]!) / 2;
  const others = activeOutposts(save).filter((o) => o.id !== except);
  let best: MapCell | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of islandCells()) {
    if (zoneOfCell(c) !== zone || !canHoldOutpost(c)) continue;
    if (others.some((o) => cellsApart(o.cell, c) < OUTPOST_MIN_SPACING)) continue;
    const d = cellDistance(c);
    const cosA = (c.x * u.x + c.y * u.y) / d;
    const score = (1 - cosA) * 10 + Math.abs(d - mid);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/* ------------------------------ Validation ------------------------------ */

function tidy(text: unknown, max: number): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

export function isOutpostTypeId(v: unknown): v is OutpostTypeId {
  return typeof v === 'string' && (OUTPOST_TYPE_IDS as readonly string[]).includes(v);
}

/** Related habits: the given 1-2 valid ones, else the type's defaults; `other` has none to fall back on. */
export function resolveOutpostHabits(type: OutpostTypeId, habits: readonly string[] | undefined): HabitId[] | null {
  const given = habits ? [...new Set(habits.filter((h): h is HabitId => (HABIT_IDS as readonly string[]).includes(h)))] : [];
  if (given.length > 2) return null;
  if (given.length > 0) return given;
  const defaults = getOutpostType(type).habits;
  return defaults.length > 0 ? [...defaults] : null;
}

function nameTaken(save: Pick<SaveFile, 'map'>, name: string, except?: string): boolean {
  const key = name.toLowerCase();
  return activeOutposts(save).some((o) => o.id !== except && o.name.toLowerCase() === key);
}

/** Why `cell` cannot hold an outpost now, or null when it can (`except` ignores one outpost's own cell and slot). */
export function placementError(save: SaveFile, cell: MapCell, except?: string): string | null {
  if (!isIslandCell(cell) || !canHoldOutpost(cell)) return 'cell invalid';
  const others = activeOutposts(save).filter((o) => o.id !== except);
  const zone = zoneOfCell(cell);
  if (others.filter((o) => zoneOfCell(o.cell) === zone).length >= OUTPOST_PER_ZONE) return 'zone full';
  if (others.some((o) => cellsApart(o.cell, cell) < OUTPOST_MIN_SPACING)) return 'cell taken';
  return null;
}

/* ------------------------------ Mutators ------------------------------ */

export interface OutpostInput {
  name: string;
  type: OutpostTypeId;
  habits?: readonly string[] | undefined;
  note?: string | undefined;
  cell: MapCell;
}

function today(save: SaveFile, now: number, opts?: TimeOptions): number {
  return gameDayIndex(now, save.settings.resetHour, opts?.tz);
}

/** Mark a new outpost (3.1). Emits `outpostCreated`. */
export function createOutpost(save: SaveFile, input: OutpostInput, now: number, opts?: TimeOptions): ActionResult {
  const name = tidy(input.name, OUTPOST_NAME_MAX);
  if (name === '') return refuse(save, 'name required');
  if (!isOutpostTypeId(input.type)) return refuse(save, 'unknown outpost');
  if (nameTaken(save, name)) return refuse(save, 'name taken');
  if (activeOutposts(save).length >= outpostCap(save.player.ring)) return refuse(save, 'cap reached');
  const habits = resolveOutpostHabits(input.type, input.habits);
  if (!habits) return refuse(save, 'pick a habit');
  const bad = placementError(save, input.cell);
  if (bad) return refuse(save, bad);
  const draft = clone(save);
  const day = today(draft, now, opts);
  const id = `op${draft.map.nextSeq}`;
  draft.map.nextSeq += 1;
  const outpost: Outpost = {
    id,
    name,
    type: input.type,
    habits,
    note: tidy(input.note, OUTPOST_NOTE_MAX),
    cell: { x: input.cell.x, y: input.cell.y },
    createdAt: now,
    createdDay: day,
    visits: 0,
    lastVisitDay: null,
    peak: 'marked',
    stateDays: { marked: day },
    retired: false,
  };
  draft.map.outposts.push(outpost);
  pushLog(draft, now, day, 'outpostCreated', `${name} marked on the map.`);
  return ok(draft, [{ type: 'outpostCreated', outpostId: id }]);
}

export interface OutpostPatch {
  name?: string | undefined;
  type?: OutpostTypeId | undefined;
  habits?: readonly string[] | undefined;
  note?: string | undefined;
}

/** Edit name, type, habits or note. Visits and state stay. */
export function editOutpost(save: SaveFile, id: string, patch: OutpostPatch, now: number, opts?: TimeOptions): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  const name = patch.name === undefined ? current.name : tidy(patch.name, OUTPOST_NAME_MAX);
  if (name === '') return refuse(save, 'name required');
  const type = patch.type === undefined ? current.type : patch.type;
  if (!isOutpostTypeId(type)) return refuse(save, 'unknown outpost');
  if (!current.retired && nameTaken(save, name, id)) return refuse(save, 'name taken');
  // A type change without explicit habits takes the new type's defaults; `other` keeps the current ones.
  const habitsIn = patch.habits ?? (type !== current.type && getOutpostType(type).habits.length > 0 ? undefined : current.habits);
  const habits = resolveOutpostHabits(type, habitsIn);
  if (!habits) return refuse(save, 'pick a habit');
  const draft = clone(save);
  const o = findOutpost(draft, id);
  if (!o) return refuse(save, 'unknown outpost');
  o.name = name;
  o.type = type;
  o.habits = habits;
  if (patch.note !== undefined) o.note = tidy(patch.note, OUTPOST_NOTE_MAX);
  pushLog(draft, now, today(draft, now, opts), 'outpostEdited', `${o.name} updated.`);
  return ok(draft, []);
}

/** Move an outpost to another cell; spacing and the zone cap are re-checked. */
export function moveOutpost(save: SaveFile, id: string, cell: MapCell, now: number, opts?: TimeOptions): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  if (current.retired) return refuse(save, 'outpost is retired');
  if (current.cell.x === cell.x && current.cell.y === cell.y) return ok(save, []);
  const bad = placementError(save, cell, id);
  if (bad) return refuse(save, bad);
  const draft = clone(save);
  const o = findOutpost(draft, id);
  if (!o) return refuse(save, 'unknown outpost');
  o.cell = { x: cell.x, y: cell.y };
  pushLog(draft, now, today(draft, now, opts), 'outpostMoved', `${o.name} moved on the map.`);
  return ok(draft, []);
}

/** Retire to the Ledger: off the map, out of the caps and perks, visits kept. */
export function retireOutpost(save: SaveFile, id: string, now: number, opts?: TimeOptions): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  if (current.retired) return ok(save, []);
  const draft = clone(save);
  const o = findOutpost(draft, id);
  if (!o) return refuse(save, 'unknown outpost');
  o.retired = true;
  // Any quest templates defaulting to it stop tagging; a template never names a retired outpost.
  for (const t of draft.customTemplates) if (t.outpostId === id) delete t.outpostId;
  pushLog(draft, now, today(draft, now, opts), 'outpostRetired', `${o.name} retired to the Ledger.`);
  return ok(draft, [{ type: 'outpostRetired', outpostId: id }]);
}

/**
 * Bring a retired outpost back. Needs a free slot and a name not in use; its
 * cell is re-checked and, when taken meanwhile, the engine suggests another
 * one in the same zone (`cell` lets the caller pick).
 */
export function restoreOutpost(save: SaveFile, id: string, now: number, opts?: TimeOptions & { cell?: MapCell }): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  if (!current.retired) return ok(save, []);
  if (activeOutposts(save).length >= outpostCap(save.player.ring)) return refuse(save, 'cap reached');
  if (nameTaken(save, current.name)) return refuse(save, 'name taken');
  let cell = opts?.cell ?? current.cell;
  let bad = placementError(save, cell);
  if (bad === 'cell taken' && opts?.cell === undefined) {
    const zone = zoneOfCell(current.cell);
    const dirs: Compass[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const suggested = dirs.map((d) => suggestOutpostCell(save, zone, d)).find((c): c is MapCell => c !== null);
    if (suggested) {
      cell = suggested;
      bad = null;
    }
  }
  if (bad) return refuse(save, bad);
  const draft = clone(save);
  const o = findOutpost(draft, id);
  if (!o) return refuse(save, 'unknown outpost');
  o.retired = false;
  o.cell = { x: cell.x, y: cell.y };
  pushLog(draft, now, today(draft, now, opts), 'outpostRestored', `${o.name} is back on the map.`);
  return ok(draft, [{ type: 'outpostRestored', outpostId: id }]);
}

/** Delete a retired outpost and its visits (privacy, 3.5). Never suggested by the game. */
export function forgetOutpost(save: SaveFile, id: string, now: number, opts?: TimeOptions): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  if (!current.retired) return refuse(save, 'not retired');
  const draft = clone(save);
  draft.map.outposts = draft.map.outposts.filter((o) => o.id !== id);
  draft.map.visits = draft.map.visits.filter((v) => v.outpostId !== id);
  for (const t of draft.customTemplates) if (t.outpostId === id) delete t.outpostId;
  pushLog(draft, now, today(draft, now, opts), 'outpostForgotten', 'An outpost was forgotten.');
  return ok(draft, []);
}

/* ------------------------------ Visits ------------------------------ */

/**
 * Record a visit on the draft: counted when the outpost has no counted visit
 * that day, otherwise an uncounted entry for the Ledger. A counted visit
 * raises `visits`, maybe `peak`, and emits the events.
 */
export function recordVisitDraft(draft: SaveFile, o: Outpost, day: number, now: number, source: VisitSource, instanceId: string | null): GameEvent[] {
  const counted = countedVisitOn(draft, o.id, day) === undefined;
  draft.map.visits.push({ outpostId: o.id, day, at: now, source, instanceId, counted });
  if (draft.map.visits.length > VISIT_LOG_MAX) draft.map.visits.splice(0, draft.map.visits.length - VISIT_LOG_MAX);
  const events: GameEvent[] = [];
  if (counted) {
    o.visits += 1;
    o.lastVisitDay = o.lastVisitDay === null ? day : Math.max(o.lastVisitDay, day);
    const reached = outpostStateFor(o.visits);
    if (STATE_RANK[reached] > STATE_RANK[o.peak]) {
      o.peak = reached;
      if (o.stateDays[reached] === undefined) o.stateDays[reached] = day;
      events.push({ type: 'outpostStateReached', outpostId: o.id, state: reached });
    }
  }
  events.unshift({ type: 'outpostVisited', outpostId: o.id, visits: o.visits, source, counted });
  const line = `${o.name}: visit logged${counted ? '' : ' (already counted today)'}. ${o.visits} visits.`;
  pushLog(draft, now, day, 'outpostVisited', line);
  return events;
}

/** "I was there": one counted check-in per game day (3.2). */
export function logOutpostVisit(save: SaveFile, id: string, now: number, opts?: TimeOptions): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  if (current.retired) return refuse(save, 'outpost is retired');
  const day = today(save, now, opts);
  if (countedVisitOn(save, id, day)) return refuse(save, 'already logged today');
  const draft = clone(save);
  const o = findOutpost(draft, id);
  if (!o) return refuse(save, 'unknown outpost');
  return ok(draft, recordVisitDraft(draft, o, day, now, 'checkin', null));
}

/** The board's day when it is today's board (the clock-set-back case counts `lastOpenDay`'s board as today's). */
function currentBoardDay(save: SaveFile, now: number, opts?: TimeOptions): number | null {
  const b = save.board;
  if (!b) return null;
  const t = today(save, now, opts);
  return b.day === t || (t < b.day && b.day === save.lastOpenDay) ? b.day : null;
}

/** Tag a done quest with the place it happened (the settlement window). Counted if the day is still free. */
export function tagQuestAtOutpost(save: SaveFile, instanceId: string, outpostId: string, now: number, opts?: TimeOptions): ActionResult {
  const o = findOutpost(save, outpostId);
  if (!o) return refuse(save, 'unknown outpost');
  if (o.retired) return refuse(save, 'outpost is retired');
  const day = currentBoardDay(save, now, opts);
  const q = save.board?.quests.find((x) => x.instanceId === instanceId);
  if (day === null || !q || q.status !== 'done') return refuse(save, 'quest not done');
  if (visitForQuest(save, instanceId)) return refuse(save, 'already tagged');
  const draft = clone(save);
  const target = findOutpost(draft, outpostId);
  if (!target) return refuse(save, 'unknown outpost');
  return ok(draft, recordVisitDraft(draft, target, day, now, 'quest', instanceId));
}

/**
 * Recompute `lastVisitDay` after a counted visit was removed. `visits` is the
 * counter of record; the log is capped, so when no counted entry remains and
 * the removed day was the newest, the day is simply unknown (`null`).
 */
function refreshLastVisit(draft: SaveFile, o: Outpost, removedDay: number): void {
  let newest: number | null = null;
  for (const v of draft.map.visits) if (v.outpostId === o.id && v.counted && (newest === null || v.day > newest)) newest = v.day;
  if (newest !== null) o.lastVisitDay = newest;
  else if (o.visits === 0 || o.lastVisitDay === removedDay) o.lastVisitDay = null;
}

/**
 * Remove the visit a quest tagged (called by `undoQuest`). A counted visit
 * hands its count to a same-day check-in when there is one, otherwise the
 * day's visit is taken back. `peak` never drops (3.3).
 */
export function untagQuestDraft(draft: SaveFile, instanceId: string): void {
  const i = draft.map.visits.findIndex((v) => v.instanceId === instanceId);
  if (i < 0) return;
  const [v] = draft.map.visits.splice(i, 1);
  if (!v || !v.counted) return;
  const o = findOutpost(draft, v.outpostId);
  if (!o) return;
  const heir = draft.map.visits.find((x) => x.outpostId === v.outpostId && x.day === v.day && !x.counted);
  if (heir) {
    heir.counted = true;
    return;
  }
  o.visits = Math.max(0, o.visits - 1);
  refreshLastVisit(draft, o, v.day);
}

/** Take back today's check-in. Refused when a tagged quest shares the day (undo that quest instead). */
export function undoOutpostVisit(save: SaveFile, id: string, now: number, opts?: TimeOptions): ActionResult {
  const current = findOutpost(save, id);
  if (!current) return refuse(save, 'unknown outpost');
  const day = today(save, now, opts);
  const counted = countedVisitOn(save, id, day);
  if (!counted || counted.source !== 'checkin') return refuse(save, 'nothing to undo');
  if (save.map.visits.some((v) => v.outpostId === id && v.day === day && v.source === 'quest')) return refuse(save, 'nothing to undo');
  const draft = clone(save);
  const o = findOutpost(draft, id);
  if (!o) return refuse(save, 'unknown outpost');
  const i = draft.map.visits.findIndex((v) => v.outpostId === id && v.day === day && v.counted);
  draft.map.visits.splice(i, 1);
  const heir = draft.map.visits.find((x) => x.outpostId === id && x.day === day && !x.counted);
  if (heir) heir.counted = true;
  else {
    o.visits = Math.max(0, o.visits - 1);
    refreshLastVisit(draft, o, day);
  }
  pushLog(draft, now, day, 'outpostVisitUndone', `${o.name}: today's visit taken back.`);
  return ok(draft, [{ type: 'outpostVisitUndone', outpostId: id }]);
}
