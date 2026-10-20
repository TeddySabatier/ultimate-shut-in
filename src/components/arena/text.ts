/**
 * Arena copy helpers. Buff and slot labels come from `strings.arena`; bank
 * amounts follow the same formula as the engine (`arenaContent.banking`).
 */
import { arenaContent, formatLine, strings, type ArenaRunBuffKind } from '../../game';

const a = strings.arena;

export function slotLabel(slot: 'blade' | 'mail' | 'charm'): string {
  if (slot === 'blade') return a.slotHand;
  if (slot === 'mail') return a.slotKit;
  return a.slotCharm;
}

export function buffLabel(kind: ArenaRunBuffKind | string, amount: number): string {
  switch (kind) {
    case 'attack':
      return formatLine(a.buffAttack, { n: amount });
    case 'defense':
      return formatLine(a.buffDefense, { n: amount });
    case 'time':
      return formatLine(a.buffTime, { n: amount });
    case 'hint':
      return formatLine(a.buffHint, { n: amount });
    case 'revive':
      return formatLine(a.buffRevive, { n: amount });
    case 'luck':
      return formatLine(a.buffLuck, { n: amount });
    default:
      return kind;
  }
}

export function bankPreview(pendingScore: number): { coins: number; defense: number; gearId: string | null } {
  const b = arenaContent.banking;
  const coins = Math.round(pendingScore * b.coinsPerScore * b.coinScoreShare);
  const defense = Math.round(pendingScore * b.defensePerScore * b.defenseScoreShare);
  let gearId: string | null = null;
  if (pendingScore >= b.rareGearMinScore) {
    const tier3 = arenaContent.gear.filter((g) => g.tier === 3);
    gearId = tier3[pendingScore % tier3.length]?.id ?? null;
  }
  return { coins, defense, gearId };
}
