/**
 * Internal helpers for the "pure, immutable, events-out" contract.
 *
 * Every public action clones the incoming save once (`clone`), mutates the
 * clone through the `*Draft` helpers in each module, and returns it together
 * with the events that were raised. Callers never see a mutated input.
 */
import type { GameEvent, SaveFile } from './types';

export const MAX_LOG_ENTRIES = 200;

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function pushLog(draft: SaveFile, at: number, day: number, kind: string, text: string): void {
  draft.log.push({ at, day, kind, text });
  if (draft.log.length > MAX_LOG_ENTRIES) draft.log.splice(0, draft.log.length - MAX_LOG_ENTRIES);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function ok(save: SaveFile, events: GameEvent[]): { save: SaveFile; events: GameEvent[] } {
  return { save, events };
}

export function refuse(save: SaveFile, error: string): { save: SaveFile; events: GameEvent[]; error: string } {
  return { save, events: [], error };
}
