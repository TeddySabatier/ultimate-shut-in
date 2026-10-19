/**
 * City Map bookkeeping that is not about outposts: domain snapshots taken at
 * every wave settlement (quiet included), the "last look" the map animates
 * from, and the compare baseline for the *7 days* toggle
 * (docs/design/CITY-MAP.md 2.4, 4.1, 4.3).
 */
import { clone, ok } from './draft';
import { WAVE_HISTORY_MAX } from './economy';
import { gameDayIndex, type TimeOptions } from './time';
import type { ActionResult, DomainSnapshot, SaveFile, WaveResult } from './types';

export const SNAPSHOT_MAX = WAVE_HISTORY_MAX;
/** The compare ghost shows the wall as it stood at least this many days ago. */
export const COMPARE_DAYS = 7;
/** Scorch marks fade over this many days; the walls-held flag lasts half of it (2.4). */
export const RESIDUE_DAYS = 14;
export const FLAG_DAYS = 7;

/** Append the snapshot of a settlement on the draft; `periodIndex` must rise, so a replay never duplicates one. */
export function appendSnapshotDraft(draft: SaveFile, periodIndex: number, day: number, result: WaveResult): void {
  const last = draft.map.snapshots[draft.map.snapshots.length - 1];
  if (last && periodIndex <= last.periodIndex) return;
  draft.map.snapshots.push({ periodIndex, day, domainPoints: draft.player.domainPoints, ring: draft.player.ring, result });
  if (draft.map.snapshots.length > SNAPSHOT_MAX) draft.map.snapshots.splice(0, draft.map.snapshots.length - SNAPSHOT_MAX);
}

/** Record that the player looked at the map today, at the current DP. No events. */
export function markMapSeen(save: SaveFile, now: number, opts?: TimeOptions): ActionResult {
  const day = gameDayIndex(now, save.settings.resetHour, opts?.tz);
  const dp = save.player.domainPoints;
  if (save.map.lastSeen && save.map.lastSeen.day === day && save.map.lastSeen.domainPoints === dp) return ok(save, []);
  const draft = clone(save);
  draft.map.lastSeen = { day, domainPoints: dp };
  return ok(draft, []);
}

/**
 * The baseline for "7 days ago": the newest snapshot at least 7 days old,
 * else the oldest one, else a zero-DP snapshot from the first play day so the
 * ghost wall still has something honest to draw.
 */
export function compareSnapshot(save: Pick<SaveFile, 'map' | 'firstPlayDay'>, today: number): DomainSnapshot {
  const snaps = save.map.snapshots;
  for (let i = snaps.length - 1; i >= 0; i--) {
    const s = snaps[i]!;
    if (s.day <= today - COMPARE_DAYS) return s;
  }
  const oldest = snaps[0];
  if (oldest) return oldest;
  return { periodIndex: -1, day: save.firstPlayDay, domainPoints: 0, ring: 1, result: 'quiet' };
}

/** Every settled, non-quiet wave counts as "walls held", losses included (2.4). */
export function wallsHeld(save: Pick<SaveFile, 'stats'>): number {
  return save.stats.waveWins + save.stats.waveLosses;
}

export interface WaveResidue {
  periodIndex: number;
  result: Exclude<WaveResult, 'quiet'>;
  /** Days since the settlement, 0 on the day it settled. */
  age: number;
  /** Domain Points at settlement: the wall stood at `wallRadius(domainPoints)`. */
  domainPoints: number;
}

/** Non-quiet settlements still leaving marks today (age under 14 days), oldest first. */
export function waveResidue(save: Pick<SaveFile, 'map'>, today: number): WaveResidue[] {
  const out: WaveResidue[] = [];
  for (const s of save.map.snapshots) {
    if (s.result === 'quiet') continue;
    const age = today - s.day;
    if (age < 0 || age >= RESIDUE_DAYS) continue;
    out.push({ periodIndex: s.periodIndex, result: s.result, age, domainPoints: s.domainPoints });
  }
  return out;
}
