/**
 * The Lottery after a win (docs/design/ARENA.md 5.2): three run buffs as
 * large cards, keep one. The player may also bank right away and skip it.
 */
import { useId } from 'react';
import { strings, type ArenaRunRecord, type SaveFile } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { Icon } from '../Icon';
import { SystemWindow } from '../SystemWindow';
import { BankPanel } from './BankPanel';
import { buffAmount, buffDef, BUFF_ICON } from './format';
import { RunStatus } from './RunStatus';
import { useArenaFeedback } from './useArenaFeedback';
import styles from './arena.module.css';

const u = strings.arena.ui;

interface Props {
  save: SaveFile;
  onBanked: (record: ArenaRunRecord) => void;
}

export function LotteryPick({ save, onBanked }: Props) {
  const arenaPickBuff = useGameStore((s) => s.arenaPickBuff);
  const { message, report } = useArenaFeedback();
  const ids = useId();
  const run = save.arena.run;
  if (!run) return null;

  return (
    <>
      <SystemWindow title={u.lottery.heading} tone="accent" data-testid="arena-lottery">
        <p className={styles.line}>{u.lottery.intro}</p>
        <ul className={styles.offers}>
          {run.offers.map((offer, i) => {
            const def = buffDef(offer);
            const name = def?.name ?? offer.kind;
            const amount = buffAmount(offer.kind, offer.amount);
            const rare = def?.rare === true;
            const blurbId = `${ids}-blurb-${i}`;
            return (
              <li key={offer.id} className={styles.offerItem}>
                <button
                  type="button"
                  className={styles.offer}
                  aria-label={[name, amount, rare ? u.lottery.rare : null].filter(Boolean).join(', ')}
                  aria-describedby={blurbId}
                  onClick={() => report(arenaPickBuff(offer.id), null)}
                >
                  <Icon src={BUFF_ICON[offer.kind]} size="2rem" className={styles.offerIcon} />
                  <span className={styles.offerText}>
                    <span className={styles.offerName}>{name}</span>
                    <span className={styles.offerAmount}>
                      {amount}
                      {rare ? <span className={styles.badge}>{u.lottery.rare}</span> : null}
                    </span>
                    {def ? (
                      <span id={blurbId} className={styles.offerBlurb}>
                        {def.blurb}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className={styles.note}>{u.lottery.skip}</p>
        <p className={styles.live} role="status" aria-live="polite">
          {message}
        </p>
      </SystemWindow>

      <SystemWindow title={u.run.heading}>
        <RunStatus run={run} />
      </SystemWindow>

      <BankPanel save={save} onBanked={onBanked} />
    </>
  );
}
