import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title?: string;
  children: ReactNode;
}

/** Retro RPG dialog box: hard border, hard shadow, optional heading. */
export function Panel({ title, children }: PanelProps) {
  return (
    <section className={styles.panel}>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
