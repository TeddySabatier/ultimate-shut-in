import { formatLine, strings } from '../../game';
import { getGearItem } from '../../game/arena';
import { useGameStore } from '../../state/gameStore';
import { SystemWindow } from '../SystemWindow';
import { bankPreview } from './text';
import styles from './arena.module.css';

const a = strings.arena;

export function BankPanel({ pendingScore, onContinue }: { pendingScore: number; onContinue: () => void }) {
  const bank = useGameStore((s) => s.bankArenaRun);
  const preview = bankPreview(pendingScore);
  const gearName = preview.gearId ? (getGearItem(preview.gearId)?.name ?? a.bankGear) : null;
  return (
    <SystemWindow title={a.bankTitle} data-testid="arena-bank">
      <p className={styles.intro}>{a.bankIntro}</p>
      <div className={styles.actions}>
        <button type="button" className="btn btn--primary" onClick={() => bank('coins')} data-testid="arena-bank-coins">
          {formatLine(a.bankCoins, { coins: preview.coins })}
        </button>
        <button type="button" className="btn" onClick={() => bank('defense')} data-testid="arena-bank-defense">
          {formatLine(a.bankDefense, { n: preview.defense })}
        </button>
        {preview.gearId ? (
          <button type="button" className="btn" onClick={() => bank('gear')} data-testid="arena-bank-gear">
            {gearName ?? a.bankGear}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onContinue} data-testid="arena-continue">
          {a.continue}
        </button>
        <button type="button" className="btn" onClick={() => bank('coins')} data-testid="arena-leave">
          {a.leave}
        </button>
      </div>
    </SystemWindow>
  );
}
