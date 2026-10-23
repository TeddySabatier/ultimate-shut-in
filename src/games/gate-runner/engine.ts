/**
 * Haven Rush: a lane runner with maths gates. Pure, seeded, fixed 50 ms ticks.
 *
 * The squad runs forward on its own and shoots. The player picks the half of the lane to stand in
 * (`side`); on a gate line the half decides which gate of the pair the squad takes. Crowds and walls
 * cost members on contact, a boss at the end must be shot down before it reaches the squad. The level
 * (layout and boss hit points) is a function of the seed and the difficulty, proven winnable by the
 * solver in level.ts; the party and the buffs make the same level easier (rules.ts, docs/games/gate-runner.md).
 */
import { fnv1a, mulberry32 } from '../../game/rng';
import {
  FIXED_DT_MS,
  buffAmount,
  clampScore,
  formatText,
  turnRng,
  type GameEngine,
  type Locale,
  type Outcome,
  type Party,
  type RunContext,
} from '../contract';
import { makeLevel, solve } from './level';
import {
  BOSS_START,
  CENTER,
  POWER_STEP,
  SHIELD_EAT,
  SOCIAL_GATE_Y,
  START_BASE,
  STEER_BASE,
  cloneForTick,
  isOver,
  tickMut,
  type Gate,
  type GateRunnerState,
} from './rules';
import { strings, type HavenRushStrings } from './strings';

export * from './rules';
export { PAIRS, GATE_WEIGHTS, TUNING, marginPct, makeLevel, solve, greedy, playPath, simState, MAX_ATTEMPTS } from './level';

export type GateRunnerAction = { type: 'tick' } | { type: 'side'; side: 0 | 1 } | { type: 'slow'; on: boolean } | { type: 'forfeit' };

/** The gate a Social vassal adds before the first one: +3 on both sides. */
export const SOCIAL_GATE: Gate = { y: SOCIAL_GATE_Y, l: { k: 'add', n: 3 }, r: { k: 'add', n: 3 } };
/** How much the bot errs, in percent per gate pair, by difficulty 1..5. */
export const BOT_ERROR_PCT = [4, 7, 10, 11, 14] as const;
/** The bot starts to move to its half when the gate is this close (units). */
export const BOT_LEAD = 140;

const hasHabit = (party: Party, habit: string): boolean => party.members.some((m) => m.habit === habit);
const habitPower = (party: Party, habit: string): number => party.members.reduce((best, m) => (m.habit === habit && m.power > best ? m.power : best), 0);

/** Start squad: 5, one per member, one more per 30 points of total power, then the defense buff. */
export function startSquadOf(party: Party, run: RunContext): number {
  const power = party.members.reduce((a, m) => a + m.power, 0);
  const base = START_BASE + party.members.length + Math.floor(power / POWER_STEP);
  return Math.max(1, Math.floor((base * (100 + buffAmount(run, 'defense'))) / 100));
}

/** Units per tick the squad slides between the halves: a Move vassal is quicker, and quicker with power. */
export function steerRateOf(party: Party): number {
  return STEER_BASE + (hasHabit(party, 'move') ? 6 + Math.floor(habitPower(party, 'move') / 10) : 0);
}

function initial(seed: number, party: Party, run: RunContext, locale: Locale): GateRunnerState {
  const d = run.difficulty;
  const level = makeLevel(mulberry32(fnv1a(`gate-runner:${seed >>> 0}`)), d);
  const social = hasHabit(party, 'social');
  return {
    seed: seed >>> 0,
    step: 0,
    locale,
    difficulty: d,
    phase: 'run',
    squad: startSquadOf(party, run),
    x: CENTER,
    side: 1,
    rate: steerRateOf(party),
    y: 0,
    slow: false,
    slowTicks: Math.floor((buffAmount(run, 'time') * 1000) / FIXED_DT_MS),
    cd: 0,
    rapid: 0,
    shield: hasHabit(party, 'eat') ? SHIELD_EAT : 0,
    revives: buffAmount(run, 'revive'),
    hints: buffAmount(run, 'hint'),
    atk: buffAmount(run, 'attack'),
    luck: buffAmount(run, 'luck'),
    study: hasHabit(party, 'study'),
    gates: social ? [SOCIAL_GATE, ...level.gates] : level.gates,
    gi: 0,
    foes: level.foes,
    fi: 0,
    items: level.items,
    ii: 0,
    bossLine: level.bossLine,
    bossHp: level.bossHp,
    bossMax: level.bossHp,
    bossGap: BOSS_START,
    plan: social ? [1, ...level.plan] : level.plan,
    par: level.par,
    picks: 0,
    troopIds: party.members.map((m) => m.id),
    events: [],
  };
}

function reduce(state: GateRunnerState, action: GateRunnerAction): GateRunnerState {
  if (isOver(state)) return state;
  switch (action.type) {
    case 'tick': {
      const next = cloneForTick(state);
      tickMut(next, true);
      return next;
    }
    case 'side':
      return (action.side === 0 || action.side === 1) && action.side !== state.side ? { ...state, side: action.side } : state;
    case 'slow':
      return typeof action.on === 'boolean' && action.on !== state.slow ? { ...state, slow: action.on } : state;
    case 'forfeit':
      return { ...state, phase: 'fled' };
    default:
      return state;
  }
}

/** The best half for the next gate from the squad as it is now: the hint buff's arrow (perfect play ahead). */
export function bestSide(state: GateRunnerState): 0 | 1 {
  if (isOver(state) || state.gi >= state.gates.length) return state.side;
  return solve(state).path[0] === 0 ? 0 : 1;
}

export function outcomeLog(s: GateRunnerState, t: HavenRushStrings): string[] {
  const lines: string[] = [];
  for (const e of s.events) {
    if (e.t === 'gate') lines.push(formatText(t.log.gate, { op: e.op, before: e.a, after: e.b }));
    else if (e.t === 'hit') lines.push(formatText(e.op === 'wall' ? t.log.hitWall : t.log.hitCrowd, { n: e.a }));
    else if (e.t === 'pick') lines.push(formatText(e.op === 'rapid' ? t.log.pickRapid : t.log.pickMembers, { n: e.a }));
    else if (e.t === 'revive') lines.push(t.log.revive);
  }
  if (s.phase === 'won') lines.push(formatText(t.log.endWon, { n: s.squad }));
  else if (s.phase === 'fled') lines.push(formatText(t.log.endFled, { n: s.squad }));
  else if (s.squad <= 0) lines.push(t.log.endLostSquad);
  else lines.push(t.log.endLostBoss);
  return lines;
}

/**
 * The score, 0..1000. Won: 400, up to 300 for the squad left (against twice the squad the proven path
 * brings to the boss), up to 200 for how early the boss fell, up to 100 for pickups. A loss or a
 * retreat counts how far the squad ran and how much of the boss it took off.
 */
export function scoreOf(s: GateRunnerState): number {
  const progress = s.bossLine > 0 ? Math.min(1, s.y / s.bossLine) : 0;
  if (s.phase === 'won') {
    const squadPart = Math.min(300, Math.floor((300 * s.squad) / (2 * Math.max(1, s.par))));
    const timePart = Math.floor((200 * s.bossGap) / BOSS_START);
    return clampScore(400 + squadPart + timePart + Math.min(100, s.picks * 20));
  }
  const bossPart = Math.floor((200 * (s.bossMax - s.bossHp)) / Math.max(1, s.bossMax));
  if (s.phase === 'fled') return clampScore(Math.floor(100 * progress));
  return clampScore(Math.floor(150 * progress) + bossPart + Math.min(50, s.picks * 10));
}

function outcome(s: GateRunnerState): Outcome | null {
  if (!isOver(s)) return null;
  return {
    result: s.phase === 'won' ? 'won' : s.phase === 'fled' ? 'fled' : 'lost',
    score: scoreOf(s),
    log: outcomeLog(s, strings[s.locale]),
    troopsUsed: [...s.troopIds],
    stats: {
      squad: s.squad,
      bossHp: s.bossHp,
      bossMax: s.bossMax,
      pickups: s.picks,
      ticks: s.step,
    },
  };
}

/**
 * A competent player: follow the proven best half for each gate, move over when the gate is near,
 * and now and then (a seeded error by difficulty) take the other one.
 */
function botPlay(s: GateRunnerState, _rng: () => number): GateRunnerAction | null {
  if (isOver(s)) return null;
  const g = s.gates[s.gi];
  if (g && s.phase === 'run' && g.y - s.y <= BOT_LEAD) {
    const best: 0 | 1 = s.plan[s.gi] === 0 ? 0 : 1;
    const errs = Math.floor(turnRng(s.seed, 8000 + s.gi)() * 100) < BOT_ERROR_PCT[s.difficulty - 1]!;
    const want: 0 | 1 = errs ? (best === 0 ? 1 : 0) : best;
    if (s.side !== want) return { type: 'side', side: want };
  }
  return { type: 'tick' };
}

export const engine: GameEngine<GateRunnerState, GateRunnerAction> = {
  initial,
  reduce,
  outcome,
  botPlay,
  forfeit: () => ({ type: 'forfeit' }),
};
