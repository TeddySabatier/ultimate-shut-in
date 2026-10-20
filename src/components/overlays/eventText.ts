/**
 * Copy for the small "system window" toasts. Every line comes from
 * `strings.json` pools (seeded so a re-render shows the same line) or from a
 * content definition; nothing here computes a number.
 */
import { formatLine, getCombo, getHabit, getOutpostState, getTitle, nextOutpostState, resolveTemplate, strings, TIED_HABIT, vassalName, type GameEvent, type SaveFile } from '../../game';
import { seededLine } from '../../state/selectors';
import type { WindowTone } from '../SystemWindow';

export interface ToastCopy {
  title: string;
  line: string;
  tone: WindowTone;
}

function questTitle(save: SaveFile, instanceId: string): string {
  const q = save.board?.quests.find((x) => x.instanceId === instanceId);
  const t = q ? resolveTemplate(save, q.templateId) : undefined;
  return t?.title ?? 'the quest';
}

function customTitle(save: SaveFile, templateId: string): string {
  return resolveTemplate(save, templateId)?.title ?? 'The quest';
}

/** Stable identity for the event at the head of the queue (resets overlay state per event). */
export function eventKey(e: GameEvent): string {
  switch (e.type) {
    case 'questDone':
    case 'questTried':
    case 'questUndone':
      return `${e.type}:${e.instanceId}`;
    case 'questRerolled':
      return `${e.type}:${e.newInstanceId}`;
    case 'levelUp':
      return `${e.type}:${e.level}`;
    case 'vassalLevelUp':
      return `${e.type}:${e.habit}:${e.level}`;
    case 'utilityRestored':
      return `${e.type}:${e.utility}`;
    case 'utilityDegraded':
      return `${e.type}:${e.utility}:${e.state}`;
    case 'titleEarned':
      return `${e.type}:${e.titleId}`;
    case 'comboForged':
    case 'comboUnforged':
      return `${e.type}:${e.comboId}`;
    case 'ringUnlocked':
      return `${e.type}:${e.ring}`;
    case 'waveSettled':
      return `${e.type}:${e.record.index}`;
    case 'vassalLeft':
    case 'vassalReturned':
      return `${e.type}:${e.habit}`;
    case 'catchUp':
      return `${e.type}:${e.days}`;
    case 'resurrectionUsed':
      return `${e.type}:${e.restored}:${e.habit ?? ''}`;
    case 'boardIssued':
      return `${e.type}:${e.day}`;
    case 'customSaved':
    case 'customUpdated':
    case 'customArchived':
      return `${e.type}:${e.templateId}`;
    case 'customBoarded':
      return `${e.type}:${e.instanceId}`;
    case 'proposalsIssued':
      return `${e.type}:${e.count}`;
    case 'proposalResolved':
      return `${e.type}:${e.id}:${e.accepted ? 'yes' : 'no'}`;
    case 'outpostCreated':
    case 'outpostVisitUndone':
    case 'outpostRetired':
    case 'outpostRestored':
      return `${e.type}:${e.outpostId}`;
    case 'outpostVisited':
      return `${e.type}:${e.outpostId}:${e.visits}:${e.counted ? 'c' : 'u'}`;
    case 'outpostStateReached':
      return `${e.type}:${e.outpostId}:${e.state}`;
    case 'outpostWithinWalls':
      return `${e.type}:${e.outpostId}:${e.ring}`;
    // Arena events (brief G1): G2 gives them their own toasts.
    case 'arenaRunStarted':
    case 'arenaGameResolved':
    case 'arenaBuffPicked':
    case 'arenaBanked':
    case 'arenaRunEnded':
    case 'arenaGearBought':
    case 'arenaGearEquipped':
    case 'arenaTrained':
    case 'arenaDecorBought':
    case 'arenaRequestSaved':
      return e.type;
  }
}

/** Toast copy for the small events; null for events that get a full window. */
export function toastCopy(save: SaveFile, e: GameEvent): ToastCopy | null {
  const key = eventKey(e);
  switch (e.type) {
    case 'questDone': {
      const quest = questTitle(save, e.instanceId);
      return {
        title: strings.ui.settlement,
        line: seededLine(strings.questDone, key, { quest, xp: e.rewards.xp, coins: e.rewards.coins, name: vassalName(e.habit) }),
        tone: 'success',
      };
    }
    case 'questTried':
      return { title: 'Attempt logged', line: seededLine(strings.questTried, key, { quest: questTitle(save, e.instanceId), name: vassalName(e.habit) }), tone: 'default' };
    case 'questUndone':
      return { title: 'Reverted', line: seededLine(strings.questUndone, key, { name: vassalName(e.habit) }), tone: 'default' };
    case 'questRerolled':
      return { title: 'Quest swapped', line: `${questTitle(save, e.newInstanceId)} is on the board. -${e.cost} settlement.`, tone: 'default' };
    case 'vassalLevelUp':
      return { title: 'Vassal level up', line: `${vassalName(e.habit)} reached level ${e.level}. The seat gets a cushion.`, tone: 'accent' };
    case 'utilityRestored':
      return {
        title: `${strings.ui[e.utility]} restored`,
        line: seededLine(strings.utilityRestored, key, { utility: strings.ui[e.utility], name: vassalName(TIED_HABIT[e.utility]) }),
        tone: 'success',
      };
    case 'utilityDegraded': {
      const habit = TIED_HABIT[e.utility];
      return {
        title: `${strings.ui[e.utility]} ${e.state}`,
        line: seededLine(strings.utilityDegraded, key, { utility: strings.ui[e.utility], name: vassalName(habit), habit: getHabit(habit).label }),
        tone: 'default',
      };
    }
    case 'titleEarned': {
      const t = getTitle(e.titleId);
      return { title: 'Title earned', line: t ? `${t.name}. ${t.flavor}` : e.titleId, tone: 'accent' };
    }
    case 'comboForged': {
      const c = getCombo(e.comboId);
      return { title: 'Item forged', line: c ? `${c.name} (+${e.power}). ${c.flavor}` : e.comboId, tone: 'accent' };
    }
    case 'catchUp':
      return { title: 'Welcome back', line: seededLine(strings.catchUp, key, { days: e.days, name: 'Pell' }), tone: 'default' };
    case 'resurrectionUsed':
      return { title: 'Token used', line: strings.resurrection.used, tone: 'accent' };
    case 'customSaved':
      return { title: 'Saved', line: formatLine(strings.compose.toasts.saved, { title: customTitle(save, e.templateId) }), tone: 'success' };
    case 'customUpdated':
      return { title: 'Updated', line: formatLine(strings.compose.toasts.updated, { title: customTitle(save, e.templateId) }), tone: 'default' };
    case 'customArchived':
      return { title: 'Archived', line: formatLine(strings.compose.toasts.archived, { title: customTitle(save, e.templateId) }), tone: 'default' };
    case 'customBoarded': {
      const q = save.board?.quests.find((x) => x.instanceId === e.instanceId);
      return { title: 'On the board', line: formatLine(strings.compose.toasts.boarded, { title: q ? customTitle(save, q.templateId) : 'The quest' }), tone: 'success' };
    }
    case 'proposalResolved': {
      const p = save.proposals.find((x) => x.id === e.id);
      const quest = p ? (p.action.type === 'create' ? p.action.draft.title : customTitle(save, p.action.templateId)) : 'It';
      return e.accepted
        ? { title: strings.proposals.heading, line: formatLine(strings.proposals.toasts.accepted, { title: quest }), tone: 'accent' }
        : { title: strings.proposals.heading, line: strings.proposals.toasts.dismissed, tone: 'default' };
    }
    case 'outpostCreated':
      return { title: 'Outpost marked', line: formatLine(strings.map.toasts.created, { name: outpostName(save, e.outpostId) }), tone: 'accent' };
    case 'outpostVisited': {
      const o = save.map.outposts.find((x) => x.id === e.outpostId);
      const name = o?.name ?? 'The outpost';
      if (!e.counted) return { title: 'Visit logged', line: formatLine(strings.map.toasts.visitedUncounted, { name }), tone: 'default' };
      const next = o ? nextOutpostState(o.peak) : null;
      const rest = next ? formatLine(strings.map.toasts.visitedNext, { n: next.minVisits - e.visits, state: next.label }) : strings.map.toasts.visitedHold;
      return { title: 'Visit logged', line: formatLine(strings.map.toasts.visited, { name, visits: e.visits, s: e.visits === 1 ? '' : 's', next: rest }), tone: 'success' };
    }
    case 'outpostVisitUndone':
      return { title: 'Reverted', line: formatLine(strings.map.toasts.undone, { name: outpostName(save, e.outpostId) }), tone: 'default' };
    case 'outpostStateReached': {
      const t = strings.map.toasts;
      const label = e.state === 'scouted' ? t.stateScouted : e.state === 'corridor' ? t.stateCorridor : e.state === 'stronghold' ? t.stateStronghold : getOutpostState(e.state).label;
      const perk = e.state === 'scouted' ? t.perkScouted : e.state === 'corridor' ? t.perkCorridor : t.perkStronghold;
      return { title: `Outpost ${getOutpostState(e.state).label}`, line: formatLine(t.stateReached, { name: outpostName(save, e.outpostId), state: label, perk }), tone: 'accent' };
    }
    case 'outpostRetired':
      return { title: 'Retired', line: formatLine(strings.map.toasts.retired, { name: outpostName(save, e.outpostId) }), tone: 'default' };
    case 'outpostRestored':
      return { title: 'Restored', line: formatLine(strings.map.toasts.restored, { name: outpostName(save, e.outpostId) }), tone: 'success' };
    default:
      return null;
  }
}

function outpostName(save: SaveFile, id: string): string {
  return save.map.outposts.find((o) => o.id === id)?.name ?? 'The outpost';
}
