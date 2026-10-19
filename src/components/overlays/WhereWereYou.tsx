import { relatedOutposts, strings, visitForQuest, type HabitId, type SaveFile } from '../../game';
import { outpostIcons } from '../../assets';
import { useGameStore } from '../../state/gameStore';
import { Icon } from '../Icon';
import styles from './overlays.module.css';

interface WhereWereYouProps {
  save: SaveFile;
  instanceId: string;
  habit: HabitId;
  onDone: () => void;
}

/**
 * The settlement window's "Where were you?" row (CITY-MAP 3.2): up to three
 * related outposts, most visited first, and *Elsewhere*. One tap tags the
 * quest; it never blocks the toast, which still dismisses on its own.
 */
export function WhereWereYou({ save, instanceId, habit, onDone }: WhereWereYouProps) {
  const tag = useGameStore((s) => s.tagQuestAtOutpost);
  if (visitForQuest(save, instanceId)) return null;
  const options = relatedOutposts(save, habit).slice(0, 3);
  if (options.length === 0) return null;
  return (
    <div className={styles.where} onClick={(e) => e.stopPropagation()}>
      <span className={styles.whereLabel}>{strings.map.settlement.where}</span>
      <div className={styles.whereRow}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn btn--sm"
            onClick={() => {
              tag(instanceId, o.id);
              onDone();
            }}
          >
            <Icon src={outpostIcons[o.type]} size={14} /> {o.name}
          </button>
        ))}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onDone}>
          {strings.map.settlement.elsewhere}
        </button>
      </div>
    </div>
  );
}
