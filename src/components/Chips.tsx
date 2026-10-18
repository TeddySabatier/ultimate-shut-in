import type { Tier } from '../game';
import { uiIcons } from '../assets';
import { cx } from '../utils/cx';
import { signed } from '../utils/format';
import { Icon } from './Icon';
import { TickUp } from './overlays/TickUp';
import styles from './Chips.module.css';

export function TierPips({ tier }: { tier: Tier }) {
  return (
    <span className={styles.pips} role="img" aria-label={`Tier ${tier}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx(styles.pip, i <= tier && styles.pipOn)} />
      ))}
    </span>
  );
}

interface RewardChipsProps {
  xp: number;
  coins: number;
  dp: number;
  loyalty?: number | undefined;
  timedBonus?: boolean | undefined;
  /** Count the numbers up (skipped under reduced motion). */
  animate?: boolean | undefined;
  className?: string | undefined;
}

/** XP / settlement / Domain Points chips with the ui icons. */
export function RewardChips({ xp, coins, dp, loyalty, timedBonus = false, animate = false, className }: RewardChipsProps) {
  const num = (n: number) => (animate ? <TickUp value={n} prefix="+" /> : <span className="mono">{signed(n)}</span>);
  return (
    <ul className={cx(styles.rewards, className)} aria-label="Rewards">
      <li className={styles.chip}>
        <span className={styles.xp} aria-hidden="true">
          XP
        </span>
        {num(xp)} <span className="srOnly">XP</span>
      </li>
      <li className={styles.chip}>
        <Icon src={uiIcons.coin} size={16} className={styles.coin} label="Settlement" />
        {num(coins)}
      </li>
      <li className={styles.chip}>
        <Icon src={uiIcons.domainPoint} size={16} className={styles.dp} label="Domain Points" />
        {num(dp)}
      </li>
      {loyalty !== undefined ? (
        <li className={styles.chip}>
          <span className="mono">{signed(loyalty)}</span> loyalty
        </li>
      ) : null}
      {timedBonus ? <li className={cx(styles.chip, styles.bonusChip)}>Timed +10%</li> : null}
    </ul>
  );
}
