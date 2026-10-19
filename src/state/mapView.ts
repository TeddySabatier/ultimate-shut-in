/**
 * Read-only view model of the City Map (docs/design/CITY-MAP.md). Every
 * number comes from an engine function; this file only arranges results for
 * the Map screen, the list view and the sheets.
 *
 * STREAM-NEEDED (B): CityMapSvg tests still fail (serialized SVG over 60 KB,
 * duplicate pin buttons, dawn cells missing under compare). Layout owns
 * dawn / corridor-lit classification from `wallR` + pins; this view only
 * supplies radii, pins, residue and the compare baseline.
 * STREAM-NEEDED (C): MapScreen tests fail on ambiguous "Outposts" / "Retire"
 * queries; `tsc` also rejects `getByRole(..., { exact: true })` in
 * MapScreen.test.tsx. Store action names are stable (`createOutpost`,
 * `visitOutpost`, `undoOutpostVisit`, `tagQuestAtOutpost`, `markMapSeen`, …).
 */
import {
  activeOutposts,
  compareSnapshot,
  countedVisitOn,
  daysUntilWave,
  fnv1a,
  gameDayIndex,
  getOutpostState,
  getOutpostType,
  getRing,
  isOutpostQuiet,
  nextOutpostState,
  outpostCap,
  ringFraction,
  rings,
  strings,
  wallRadius,
  wallsHeld,
  waveResidue,
  zoneOfCell,
  type Facility,
  type Outpost,
  type OutpostState,
  type OutpostTypeDef,
  type RingId,
  type SaveFile,
  type WaveResult,
} from '../game';

export type ZoneStatus = 'claimed' | 'current' | 'next' | 'beyond';

export interface ZoneView {
  id: RingId;
  name: string;
  threshold: number;
  wallBonus: number;
  status: ZoneStatus;
  /** DP still needed, for `next` and `beyond`. */
  dpToGo: number;
  facilities: Facility[];
  vignette: string;
  outposts: OutpostView[];
}

export interface OutpostView {
  outpost: Outpost;
  type: OutpostTypeDef;
  state: OutpostState;
  stateLabel: string;
  next: { id: OutpostState; minVisits: number; label: string } | null;
  /** 0..100 toward the next state (100 at Stronghold). */
  progressPct: number;
  zone: number;
  zoneName: string;
  quiet: boolean;
  /** Its zone is past the current ring. */
  beyond: boolean;
  /** Its cell is outside the wall as drawn (beyond or not yet reached by the creep). */
  outsideWall: boolean;
  loggedToday: boolean;
  /** A same-day check-in with no tagged quest: Undo is possible. */
  canUndoToday: boolean;
  lastVisitText: string;
}

export interface ResidueView {
  periodIndex: number;
  result: Exclude<WaveResult, 'quiet'>;
  age: number;
  /** Where the wall stood when the wave settled. */
  wallR: number;
  seed: number;
}

export interface MapView {
  today: number;
  dp: number;
  ring: RingId;
  ringName: string;
  /** 0..1 inside the current ring. */
  fraction: number;
  pct: number;
  next: { id: RingId; name: string; threshold: number } | null;
  wallR: number;
  /** The wall at the last look (or now, on a first look), for the opening animation. */
  prevWallR: number;
  sinceDp: number;
  compare: { dp: number; wallR: number; gainedDp: number; streets: number };
  residue: ResidueView[];
  zones: ZoneView[];
  outposts: OutpostView[];
  retired: OutpostView[];
  cap: number;
  free: number;
  wallsHeld: number;
  wallBonus: number;
  nextWaveDays: number;
}

function lastVisitText(o: Outpost, today: number): string {
  const m = strings.map.outposts;
  if (o.lastVisitDay === null) return o.visits === 0 ? m.noVisits : m.lastVisitUnknown;
  const days = today - o.lastVisitDay;
  if (days <= 0) return m.visitedToday;
  if (days === 1) return m.visitedYesterday;
  return m.lastVisit.replace('{days}', String(days));
}

export function outpostView(save: SaveFile, o: Outpost, today: number, ring: number, wallR: number): OutpostView {
  const state = o.peak;
  const def = getOutpostState(state);
  const next = nextOutpostState(state);
  const zone = zoneOfCell(o.cell);
  const counted = countedVisitOn(save, o.id, today);
  const taggedToday = save.map.visits.some((v) => v.outpostId === o.id && v.day === today && v.source === 'quest');
  const span = next ? next.minVisits - def.minVisits : 1;
  return {
    outpost: o,
    type: getOutpostType(o.type),
    state,
    stateLabel: def.label,
    next,
    progressPct: next ? Math.max(0, Math.min(100, Math.round(((o.visits - def.minVisits) / span) * 100))) : 100,
    zone,
    zoneName: getRing(zone).name,
    quiet: !o.retired && isOutpostQuiet(o, today),
    beyond: zone > ring,
    outsideWall: Math.hypot(o.cell.x, o.cell.y) > wallR,
    loggedToday: counted !== undefined,
    canUndoToday: counted !== undefined && counted.source === 'checkin' && !taggedToday,
    lastVisitText: lastVisitText(o, today),
  };
}

export function mapView(save: SaveFile, now: number): MapView {
  const today = gameDayIndex(now, save.settings.resetHour);
  const dp = save.player.domainPoints;
  const ring = save.player.ring;
  const rf = ringFraction(dp);
  const fraction = rf.ring === ring ? rf.fraction : 1;
  const nextDef = rings[ring] ?? null;
  const wallR = wallRadius(dp);
  const seen = save.map.lastSeen;
  const prevWallR = seen ? Math.min(wallR, wallRadius(seen.domainPoints)) : wallR;
  const base = compareSnapshot(save, today);
  const baseWall = Math.min(wallR, wallRadius(base.domainPoints));
  const active = activeOutposts(save).map((o) => outpostView(save, o, today, ring, wallR));
  const retired = save.map.outposts.filter((o) => o.retired).map((o) => outpostView(save, o, today, ring, wallR));
  const zones: ZoneView[] = rings.map((r) => {
    const status: ZoneStatus = r.id < ring ? 'claimed' : r.id === ring ? 'current' : r.id === ring + 1 ? 'next' : 'beyond';
    return {
      id: r.id,
      name: r.name,
      threshold: r.domainPointsRequired,
      wallBonus: r.wallBonus,
      status,
      dpToGo: Math.max(0, r.domainPointsRequired - dp),
      facilities: r.facilities,
      vignette: r.vignette,
      outposts: active.filter((o) => o.zone === r.id),
    };
  });
  const cap = outpostCap(ring);
  return {
    today,
    dp,
    ring,
    ringName: getRing(ring).name,
    fraction,
    pct: nextDef ? Math.round(fraction * 100) : 100,
    next: nextDef ? { id: nextDef.id, name: nextDef.name, threshold: nextDef.domainPointsRequired } : null,
    wallR,
    prevWallR,
    sinceDp: seen ? Math.max(0, dp - seen.domainPoints) : 0,
    compare: { dp: base.domainPoints, wallR: baseWall, gainedDp: Math.max(0, dp - base.domainPoints), streets: Math.round((wallR - baseWall) * 10) / 10 },
    residue: waveResidue(save, today).map((r) => ({
      periodIndex: r.periodIndex,
      result: r.result,
      age: r.age,
      wallR: wallRadius(r.domainPoints),
      seed: fnv1a(`${save.firstPlayDay}:${r.periodIndex}:scorch`),
    })),
    zones,
    outposts: active,
    retired,
    cap,
    free: Math.max(0, cap - active.length),
    wallsHeld: wallsHeld(save),
    wallBonus: getRing(ring).wallBonus,
    nextWaveDays: daysUntilWave(today, save.firstPlayDay),
  };
}
