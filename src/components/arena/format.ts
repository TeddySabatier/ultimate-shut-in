/**
 * Small display helpers shared by the Arena components. Words come from
 * `strings.arena.ui`; nothing here computes a price or a reward.
 */
import { arenaIcons } from '../../assets';
import { formatLine, getArenaBuff, strings, type ArenaBuff, type ArenaBuffDef, type ArenaBuffKind, type GearSlot } from '../../game';

const u = strings.arena.ui;

export const BUFF_ICON: Readonly<Record<ArenaBuffKind, string>> = {
  attack: arenaIcons.buffAttack,
  defense: arenaIcons.buffDefense,
  time: arenaIcons.buffTime,
  hint: arenaIcons.buffHint,
  revive: arenaIcons.buffRevive,
  luck: arenaIcons.buffLuck,
};

export const SLOT_ICON: Readonly<Record<GearSlot, string>> = {
  weapon: arenaIcons.weapon,
  armor: arenaIcons.armor,
  charm: arenaIcons.charm,
};

/** "+10% attack", "+25 seconds", "2 hints": the amount of a buff with its unit. */
export function buffAmount(kind: ArenaBuffKind, amount: number): string {
  const unit = u.units[kind];
  return formatLine(amount === 1 ? unit.one : unit.many, { amount });
}

/** The content definition of a run buff (`attack-s@2` -> `attack-s`). */
export function buffDef(buff: Pick<ArenaBuff, 'id'>): ArenaBuffDef | undefined {
  return getArenaBuff(buff.id.split('@')[0] ?? '');
}

/** A refusal code as its warm line (`strings.arena.errors`). */
export function errorLine(code: string): string {
  return (strings.arena.errors as Record<string, string | undefined>)[code] ?? u.failed;
}

/** Short date of a timestamp in the player's language ("20 Oct"). */
export function shortDate(at: number): string {
  try {
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return new Date(at).toDateString();
  }
}
