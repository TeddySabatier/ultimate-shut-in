/**
 * The Armory (docs/design/ARENA.md 4): per troop, three gear slots and
 * training; the stash of rare items; Haven decor. Prices, power and every
 * refusal come from the engine's selectors; the buttons call the store.
 */
import { useId, useState } from 'react';
import { uiIcons } from '../../assets';
import {
  arenaContent,
  buildParty,
  combos,
  decorPrice,
  formatLine,
  GEAR_SLOTS,
  gearPrice,
  gearRefusal,
  getArenaItem,
  rosterFor,
  soldItems,
  strings,
  trainingRefusal,
  trainingStatus,
  troopLabel,
  type GearSlot,
  type HabitId,
  type SaveFile,
} from '../../game';
import type { PartyMember } from '../../games/contract';
import { useGameStore } from '../../state/gameStore';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { errorLine, SLOT_ICON } from './format';
import { Purse } from './Purse';
import { useArenaFeedback } from './useArenaFeedback';
import styles from './arena.module.css';

const u = strings.arena.ui;
const a = u.armory;

/** The visible reason a purchase is closed; a short coin count when only coins are missing. */
function refusalLine(code: string, price: number, coins: number): string {
  return code === 'not enough coins' ? formatLine(a.needMore, { missing: Math.max(0, price - coins) }) : errorLine(code);
}

/** Power of a troop with gear and training, from the party the host would build. */
function powerOf(save: SaveFile, id: string): number {
  return buildParty(save).members.find((m) => m.id === id)?.power ?? 0;
}

type Report = (accepted: boolean, success: string | null) => void;

function afterChange(report: Report, accepted: boolean, troop: PartyMember): void {
  const next = useGameStore.getState().save;
  report(accepted, accepted && next ? formatLine(a.powerNow, { troop: troop.name, power: powerOf(next, troop.id) }) : null);
}

function SlotRow({ save, troop, habit, slot, report }: { save: SaveFile; troop: PartyMember; habit: HabitId; slot: GearSlot; report: Report }) {
  const arenaBuyGear = useGameStore((s) => s.arenaBuyGear);
  const ids = useId();
  const wornId = save.arena.gear[habit][slot];
  const worn = wornId === null ? undefined : getArenaItem(wornId);
  const next = soldItems(slot)
    .filter((i) => i.tier > (worn?.tier ?? 0))
    .sort((x, y) => x.tier - y.tier)[0];
  const price = next ? gearPrice(next, save.player.ring) : 0;
  const refusal = next ? gearRefusal(save, habit, next.id) : null;
  return (
    <li className={styles.slot}>
      <Icon src={SLOT_ICON[slot]} size="1.5rem" className={styles.slotIcon} />
      <div className={styles.stack}>
        <p className={styles.line}>
          <strong>{a.slots[slot]}</strong>
          {' · '}
          {worn ? formatLine(a.worn, { item: worn.name, tier: worn.tier, power: worn.power }) : a.empty}
          {worn?.rare === true ? <span className={styles.badge}>{a.rare}</span> : null}
        </p>
        {next ? (
          <>
            <p className={styles.line}>{formatLine(a.offer, { item: next.name, tier: next.tier, power: next.power, price })}</p>
            <div className={styles.row}>
              <button
                type="button"
                className="btn"
                disabled={refusal !== null}
                aria-label={formatLine(a.buyLabel, { item: next.name, troop: troop.name, price })}
                aria-describedby={refusal !== null ? `${ids}-why` : undefined}
                onClick={() => afterChange(report, arenaBuyGear(habit, next.id), troop)}
              >
                {a.buy}
              </button>
              <Purse coins={save.player.coins} template={a.purse} />
            </div>
            {refusal !== null ? (
              <p id={`${ids}-why`} className={styles.reason}>
                {refusalLine(refusal, price, save.player.coins)}
              </p>
            ) : null}
          </>
        ) : (
          <p className={styles.note}>{a.best}</p>
        )}
      </div>
    </li>
  );
}

function TrainingRow({ save, troop, habit, report }: { save: SaveFile; troop: PartyMember; habit: HabitId; report: Report }) {
  const arenaTrain = useGameStore((s) => s.arenaTrain);
  const ids = useId();
  const t = trainingStatus(save, habit);
  const refusal = trainingRefusal(save, habit);
  return (
    <div className={styles.slot}>
      <Icon src={uiIcons.timer} size="1.5rem" className={styles.slotIcon} />
      <div className={styles.stack}>
        <p className={styles.line}>
          <strong>{a.trainHeading}</strong>
          {' · '}
          <span className="mono">
            {t.bumps}/{t.maxBumps}
          </span>
        </p>
        {t.price !== null ? (
          <>
            <p className={styles.line}>{formatLine(a.trainOffer, { power: t.nextPower, price: t.price })}</p>
            <p className={styles.note}>{formatLine(a.trainWeek, { spent: t.weekSpent, cap: t.weekCap, bumps: t.weekBumps, max: t.weekBumpsMax })}</p>
            <div className={styles.row}>
              <button
                type="button"
                className="btn"
                disabled={refusal !== null}
                aria-label={formatLine(a.trainLabel, { troop: troop.name, price: t.price })}
                aria-describedby={refusal !== null ? `${ids}-why` : undefined}
                onClick={() => afterChange(report, arenaTrain(habit), troop)}
              >
                {a.train}
              </button>
              <Purse coins={save.player.coins} template={a.purse} />
            </div>
            {refusal !== null ? (
              <p id={`${ids}-why`} className={styles.reason}>
                {refusalLine(refusal, t.price, save.player.coins)}
              </p>
            ) : null}
          </>
        ) : (
          <p className={styles.note}>{errorLine('training maxed')}</p>
        )}
      </div>
    </div>
  );
}

function TroopRow({ save, troop, power, report }: { save: SaveFile; troop: PartyMember; power: number; report: Report }) {
  const habit = troop.habit;
  const worn = habit ? GEAR_SLOTS.map((slot) => ({ slot, item: save.arena.gear[habit][slot] })).filter((w) => w.item !== null) : [];
  const bumps = habit ? save.arena.training[habit] : 0;
  return (
    <li className={styles.troop}>
      <details className={styles.troopDetails}>
        <summary className={styles.troopSummary} data-testid={`arena-troop-${troop.id}`}>
          <span className={styles.troopName}>
            <strong>{troop.name}</strong> <span className="muted">{troopLabel(troop)}</span>
          </span>
          <span className={styles.troopFacts}>
            <span className="mono">{formatLine(a.power, { power })}</span>
            <span className={styles.gearIcons}>
              {worn.length === 0 ? (
                <span className="muted">{a.noGear}</span>
              ) : (
                worn.map((w) => <Icon key={w.slot} src={SLOT_ICON[w.slot]} size="1.125rem" label={`${a.slots[w.slot]}: ${getArenaItem(w.item ?? '')?.name ?? ''}`} />)
              )}
            </span>
            <span className="mono">{formatLine(a.trained, { bumps, max: arenaContent.training.bumpPower.length })}</span>
          </span>
        </summary>
        {habit ? (
          <div className={styles.troopBody}>
            <ul className={styles.slots}>
              {GEAR_SLOTS.map((slot) => (
                <SlotRow key={slot} save={save} troop={troop} habit={habit} slot={slot} report={report} />
              ))}
            </ul>
            <TrainingRow save={save} troop={troop} habit={habit} report={report} />
          </div>
        ) : null}
      </details>
    </li>
  );
}

function Stash({ save, troops, report }: { save: SaveFile; troops: PartyMember[]; report: Report }) {
  const arenaEquipRare = useGameStore((s) => s.arenaEquipRare);
  const ids = useId();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const vassals = troops.filter((t): t is PartyMember & { habit: HabitId } => t.habit !== null);
  return (
    <section className={styles.block} aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`} className={styles.subhead}>
        {a.stashHeading}
      </h3>
      {save.arena.stash.length === 0 ? (
        <p className={styles.note}>{formatLine(a.stashEmpty, { min: arenaContent.bank.itemMinWins })}</p>
      ) : (
        <ul className={styles.list}>
          {save.arena.stash.map((itemId) => {
            const item = getArenaItem(itemId);
            if (!item) return null;
            const habit = (picked[itemId] ?? vassals[0]?.habit ?? '') as HabitId | '';
            const troop = vassals.find((v) => v.habit === habit);
            const inSlot = troop ? save.arena.gear[troop.habit][item.slot] : null;
            const inSlotItem = inSlot === null ? undefined : getArenaItem(inSlot);
            const consequence = !troop || !inSlotItem ? null : inSlotItem.rare === true ? formatLine(a.wearBack, { item: inSlotItem.name }) : formatLine(a.wearSwap, { troop: troop.name, item: inSlotItem.name });
            const selectId = `${ids}-${itemId}`;
            return (
              <li key={itemId} className={styles.stashItem}>
                <p className={styles.line}>
                  <Icon src={SLOT_ICON[item.slot]} size="1.125rem" className={styles.inlineIcon} />
                  {formatLine(a.stashItem, { item: item.name, slot: a.slots[item.slot], power: item.power })}
                  <span className={styles.badge}>{a.rare}</span>
                </p>
                <div className={styles.wearRow}>
                  <label htmlFor={selectId} className={styles.label}>
                    {formatLine(a.troopFor, { item: item.name })}
                  </label>
                  <select id={selectId} className={styles.select} value={habit} onChange={(e) => setPicked((p) => ({ ...p, [itemId]: e.target.value }))}>
                    {vassals.map((v) => (
                      <option key={v.habit} value={v.habit}>
                        {v.name} ({troopLabel(v)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    disabled={!troop}
                    aria-label={troop ? formatLine(a.wearLabel, { item: item.name, troop: troop.name }) : a.wear}
                    onClick={() => troop && afterChange(report, arenaEquipRare(troop.habit, itemId), troop)}
                  >
                    {a.wear}
                  </button>
                </div>
                {!troop ? <p className={styles.reason}>{errorLine('no troops')}</p> : null}
                {consequence ? <p className={styles.note}>{consequence}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Decor({ save, report }: { save: SaveFile; report: Report }) {
  const arenaBuyDecor = useGameStore((s) => s.arenaBuyDecor);
  const ids = useId();
  const owned = new Set(save.arena.decor);
  const coins = save.player.coins;
  return (
    <section className={styles.block} aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`} className={styles.subhead}>
        {a.decorHeading}
      </h3>
      <p className={styles.note}>{a.decorIntro}</p>
      <p className={styles.row}>
        <span className={styles.text}>{formatLine(a.decorCount, { owned: owned.size, total: combos.length })}</span>
        <Purse coins={coins} template={a.purse} />
      </p>
      <ul className={styles.decorList}>
        {combos.map((c) => {
          const price = decorPrice(c.id) ?? 0;
          const have = owned.has(c.id);
          const short = !have && coins < price;
          return (
            <li key={c.id} className={styles.decor}>
              <span className={styles.decorName}>{c.name}</span>
              {have ? (
                <span className={styles.owned}>
                  <Icon src={uiIcons.check} size="1rem" />
                  {a.owned}
                </span>
              ) : (
                <>
                  <span className={styles.decorBuy}>
                    <span className="mono">{formatLine(a.decorPrice, { price })}</span>
                    <button
                      type="button"
                      className="btn"
                      disabled={short}
                      aria-label={formatLine(a.decorLabel, { decor: c.name, price })}
                      aria-describedby={short ? `${ids}-${c.id}` : undefined}
                      onClick={() => {
                        const ok = arenaBuyDecor(c.id);
                        report(ok, ok ? formatLine(strings.arena.toasts.decorBought, { decor: c.name }) : null);
                      }}
                    >
                      {a.buy}
                    </button>
                  </span>
                  {short ? (
                    <span id={`${ids}-${c.id}`} className={styles.reason}>
                      {formatLine(a.needMore, { missing: price - coins })}
                    </span>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Armory({ save }: { save: SaveFile }) {
  const { message, report } = useArenaFeedback();
  const roster = rosterFor(save);
  const power = new Map(buildParty(save).members.map((m) => [m.id, m.power] as const));
  return (
    <SystemWindow title={a.heading} data-testid="arena-armory">
      <div className={styles.stack}>
        <p className={styles.line}>{a.intro}</p>
        {roster.length === 0 ? (
          <p className={styles.reason}>{errorLine('no troops')}</p>
        ) : (
          <ul className={styles.troops}>
            {roster.map((m) => (
              <TroopRow key={m.id} save={save} troop={m} power={power.get(m.id) ?? m.power} report={report} />
            ))}
          </ul>
        )}
        <p className={styles.live} role="status" aria-live="polite" data-testid="arena-armory-status">
          {message}
        </p>
        <Stash save={save} troops={roster} report={report} />
        <Decor save={save} report={report} />
      </div>
    </SystemWindow>
  );
}
