/** What came home from the run that just ended (docs/design/ARENA.md 11): announced, focused once, dismissible. */
import { useEffect, useRef } from 'react';
import { formatLine, getArenaItem, strings, type ArenaRunRecord } from '../../game';
import { SystemWindow } from '../SystemWindow';
import styles from './arena.module.css';

const u = strings.arena.ui;

export function RunSummary({ record, onDismiss }: { record: ArenaRunRecord; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // The bank buttons are gone once the run ends, so focus lands here instead of the top of the page.
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const how = record.end === 'banked' ? u.summary.banked : record.end === 'lost' ? u.summary.lost : u.summary.fled;
  const item = record.itemId ? getArenaItem(record.itemId) : undefined;
  const nothing = record.coins === 0 && record.defense === 0 && !item;
  return (
    <div ref={ref} tabIndex={-1} className={styles.focusTarget}>
      <SystemWindow title={u.summary.heading} tone="success" data-testid="arena-summary">
        <div className={styles.stack} role="status" aria-live="polite">
          <p className={styles.line}>{formatLine(how, { wins: record.wins })}</p>
          {record.coins > 0 ? <p className={styles.line}>{formatLine(u.summary.coins, { coins: record.coins })}</p> : null}
          {record.defense > 0 ? <p className={styles.line}>{formatLine(u.summary.defense, { defense: record.defense })}</p> : null}
          {item ? <p className={styles.line}>{formatLine(u.summary.item, { item: item.name })}</p> : null}
          {nothing ? <p className={styles.note}>{u.summary.nothing}</p> : null}
        </div>
        <button type="button" className="btn" onClick={onDismiss}>
          {u.summary.dismiss}
        </button>
      </SystemWindow>
    </div>
  );
}
