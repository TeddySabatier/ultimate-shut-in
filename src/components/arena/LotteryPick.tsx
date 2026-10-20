import { arenaContent, formatLine, strings } from '../../game';
import { arenaIcons } from '../../assets';
import { useGameStore } from '../../state/gameStore';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { buffLabel } from './text';
import styles from './arena.module.css';

const a = strings.arena;
const BUFF_ICON = {
  attack: arenaIcons.buffAttack,
  defense: arenaIcons.buffDefense,
  time: arenaIcons.buffTime,
  hint: arenaIcons.buffHint,
  revive: arenaIcons.buffRevive,
  luck: arenaIcons.buffLuck,
} as const;

export function LotteryPick({ ids, score }: { ids: readonly string[]; score: number }) {
  const pick = useGameStore((s) => s.pickArenaBuff);
  const options = ids.map((id) => arenaContent.lottery.buffs.find((b) => b.id === id)).filter((b) => b !== undefined);
  return (
    <SystemWindow title={a.lotteryTitle} tone="accent" data-testid="arena-lottery">
      <p className={styles.intro}>{formatLine(a.lotteryIntro, { score })}</p>
      <div className={styles.buffs} role="group" aria-label={a.lotteryTitle}>
        {options.map((b) => (
          <button key={b.id} type="button" className={`btn ${styles.buff}`} onClick={() => pick(b.id)} data-testid={`buff-${b.id}`}>
            <Icon src={BUFF_ICON[b.kind]} size="1.5rem" />
            <span>{buffLabel(b.kind, b.amount)}</span>
          </button>
        ))}
      </div>
    </SystemWindow>
  );
}
