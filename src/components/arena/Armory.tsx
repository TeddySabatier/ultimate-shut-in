import { useState } from 'react';
import { arenaContent, formatLine, getCombo, HABIT_IDS, strings, vassalName, type HabitId } from '../../game';
import { gearPrice, getGearItem, trainingCost } from '../../game/arena';
import { arenaIcons } from '../../assets';
import { useGameStore, useSave } from '../../state/gameStore';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { slotLabel } from './text';
import styles from './arena.module.css';

const a = strings.arena;
const SLOT_ICON = { blade: arenaIcons.blade, mail: arenaIcons.mail, charm: arenaIcons.charm } as const;
type Tab = 'gear' | 'train' | 'decor';

export function Armory() {
  const save = useSave();
  const buyGear = useGameStore((s) => s.buyArenaGear);
  const buyTraining = useGameStore((s) => s.buyArenaTraining);
  const buyDecor = useGameStore((s) => s.buyArenaDecor);
  const [tab, setTab] = useState<Tab>('gear');
  const habits = HABIT_IDS.filter((h) => save.settings.enabledHabits.includes(h));
  const ring = save.player.ring;
  const fee = trainingCost(ring);

  return (
    <SystemWindow title={a.armoryTitle} data-testid="arena-armory">
      <p className={styles.intro}>{a.armoryIntro}</p>
      <div className={styles.tabs} role="group" aria-label={a.armoryTitle}>
        <button type="button" className="btn" aria-pressed={tab === 'gear'} onClick={() => setTab('gear')}>
          {a.armoryTitle}
        </button>
        <button type="button" className="btn" aria-pressed={tab === 'train'} onClick={() => setTab('train')}>
          {a.train}
        </button>
        <button type="button" className="btn" aria-pressed={tab === 'decor'} onClick={() => setTab('decor')}>
          {a.decorTitle}
        </button>
      </div>

      {tab === 'gear'
        ? habits.map((habit) => (
            <GearBlock key={habit} habit={habit} ring={ring} coins={save.player.coins} equipped={save.arena.gear[habit]} onBuy={(id) => buyGear(habit, id)} />
          ))
        : null}

      {tab === 'train' ? (
        <ul className={styles.list}>
          {habits.map((habit) => (
            <li key={habit} className={styles.row}>
              <span className={styles.body}>
                <p className={styles.name}>{vassalName(habit)}</p>
                <p className={styles.meta}>{formatLine(a.power, { n: save.arena.trainingSessions[habit] ?? 0 })}</p>
              </span>
              <button type="button" className={`btn btn--primary ${styles.price}`} disabled={save.player.coins < fee} onClick={() => buyTraining(habit)}>
                {formatLine(a.trainCost, { coins: fee })}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'decor' ? (
        <>
          <p className={styles.intro}>{a.decorIntro}</p>
          <ul className={styles.list}>
            {arenaContent.decor.map((d) => {
              const combo = getCombo(d.comboId);
              const owned = save.arena.decor.includes(d.comboId);
              const price = Math.round(d.basePrice * (1 + 0.1 * Math.max(0, ring - 1)));
              return (
                <li key={d.comboId} className={styles.row}>
                  <span className={styles.body}>
                    <p className={styles.name}>{combo?.name ?? d.comboId}</p>
                    <p className={styles.meta}>{owned ? a.owned : formatLine(a.trainCost, { coins: price })}</p>
                  </span>
                  <button
                    type="button"
                    className={`btn btn--primary ${styles.price}`}
                    disabled={owned || save.player.coins < price}
                    onClick={() => buyDecor(d.comboId)}
                  >
                    {owned ? a.owned : formatLine(a.trainCost, { coins: price })}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </SystemWindow>
  );
}

function GearBlock({
  habit,
  ring,
  coins,
  equipped,
  onBuy,
}: {
  habit: HabitId;
  ring: number;
  coins: number;
  equipped: readonly (string | null)[];
  onBuy: (itemId: string) => void;
}) {
  return (
    <section>
      <h3 className={styles.vassal}>{vassalName(habit)}</h3>
      <div className={styles.slots}>
        {arenaContent.gearSlots.map((slot, i) => {
          const worn = equipped[i] ? getGearItem(equipped[i] ?? '') : undefined;
          return (
            <div key={slot} className={styles.slot}>
              <p className={styles.slotName}>
                <Icon src={SLOT_ICON[slot]} size="1.25rem" className={styles.icon} /> {slotLabel(slot)}
              </p>
              <p className={styles.name}>{worn?.name ?? a.emptySlot}</p>
            </div>
          );
        })}
      </div>
      <ul className={styles.list}>
        {arenaContent.gear.map((item) => {
          const price = gearPrice(item, ring);
          const slotIndex = arenaContent.gearSlots.indexOf(item.slot);
          const already = equipped[slotIndex] === item.id;
          return (
            <li key={item.id} className={styles.row}>
              <Icon src={SLOT_ICON[item.slot]} size="1.375rem" className={styles.icon} />
              <span className={styles.body}>
                <p className={styles.name}>{item.name}</p>
                <p className={styles.meta}>
                  {slotLabel(item.slot)} · {formatLine(a.power, { n: item.power })}
                </p>
              </span>
              <button
                type="button"
                className={`btn btn--primary ${styles.price}`}
                disabled={already || coins < price}
                onClick={() => onBuy(item.id)}
                data-testid={`buy-${item.id}`}
              >
                {already ? a.owned : formatLine(a.trainCost, { coins: price })}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
