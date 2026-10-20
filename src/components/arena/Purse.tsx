import { uiIcons } from '../../assets';
import { formatLine, strings } from '../../game';
import { cx } from '../../utils/cx';
import { fmtNum } from '../../utils/format';
import { Icon } from '../Icon';
import styles from './arena.module.css';

/** The coin balance as a small chip: the coin icon and "312 coins" (or another template with `{coins}`). */
export function Purse({ coins, template = strings.arena.ui.purse, className }: { coins: number; template?: string; className?: string | undefined }) {
  return (
    <span className={cx(styles.coin, className)}>
      <Icon src={uiIcons.coin} size="1rem" className={styles.coinIcon} />
      <span className="mono">{formatLine(template, { coins: fmtNum(coins) })}</span>
    </span>
  );
}
