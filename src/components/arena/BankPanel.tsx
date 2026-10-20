/**
 * Banking (docs/design/ARENA.md 5.3): end the run on purpose and turn the
 * spoils into one reward. What each choice gives comes from `bankOptions`;
 * a choice that is not open says why, in words next to it.
 */
import { useId } from 'react';
import { arenaContent, bankOptions, formatLine, strings, type ArenaBankChoice, type ArenaRunRecord, type SaveFile } from '../../game';
import { useGameStore } from '../../state/gameStore';
import { SystemWindow } from '../SystemWindow';
import { errorLine } from './format';
import { useArenaFeedback } from './useArenaFeedback';
import styles from './arena.module.css';

const u = strings.arena.ui;

interface Props {
  save: SaveFile;
  onBanked: (record: ArenaRunRecord) => void;
}

interface Choice {
  choice: ArenaBankChoice;
  label: string;
  help: string;
  /** Why it cannot be taken now, or null. */
  why: string | null;
}

export function BankPanel({ save, onBanked }: Props) {
  const arenaBank = useGameStore((s) => s.arenaBank);
  const { message, report } = useArenaFeedback();
  const ids = useId();
  const options = bankOptions(save);
  const run = save.arena.run;
  if (!options || !run) return null;

  const minWins = arenaContent.bank.itemMinWins;
  const choices: Choice[] = [
    { choice: 'coins', label: formatLine(u.bank.coins, { coins: options.coins }), help: u.bank.coinsHelp, why: null },
    {
      choice: 'defense',
      label: formatLine(u.bank.defense, { amount: options.defense }),
      help: u.bank.defenseHelp,
      why: options.defense > 0 ? null : errorLine('defense capped'),
    },
    {
      choice: 'item',
      label: u.bank.item,
      help: u.bank.itemHelp,
      why: options.item ? null : run.pending.wins < minWins ? formatLine(u.bank.itemShort, { min: minWins, wins: run.pending.wins }) : errorLine('no rare item left'),
    },
  ];

  const bank = (choice: ArenaBankChoice) => {
    const record = arenaBank(choice);
    if (record) onBanked(record);
    else report(false, null);
  };

  return (
    <SystemWindow title={u.bank.heading} data-testid="arena-bank">
      <p className={styles.line}>{u.bank.intro}</p>
      <ul className={styles.bankList}>
        {choices.map((c) => (
          <li key={c.choice} className={styles.bankItem}>
            <button
              type="button"
              className="btn btn--block"
              disabled={c.why !== null}
              aria-describedby={c.why !== null ? `${ids}-${c.choice}-help ${ids}-${c.choice}-why` : `${ids}-${c.choice}-help`}
              onClick={() => bank(c.choice)}
              data-testid={`arena-bank-${c.choice}`}
            >
              {c.label}
            </button>
            <p id={`${ids}-${c.choice}-help`} className={styles.note}>
              {c.help}
            </p>
            {c.why !== null ? (
              <p id={`${ids}-${c.choice}-why`} className={styles.reason}>
                {c.why}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={styles.live} role="status" aria-live="polite">
        {message}
      </p>
    </SystemWindow>
  );
}
