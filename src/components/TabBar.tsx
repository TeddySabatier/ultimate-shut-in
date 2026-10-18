import { NavLink } from 'react-router-dom';
import styles from './TabBar.module.css';

interface Tab {
  to: string;
  label: string;
  /** Simple text glyph placeholder until pixel icons exist. */
  glyph: string;
}

const TABS: readonly Tab[] = [
  { to: '/', label: 'Home', glyph: '⌂' },
  { to: '/quests', label: 'Quests', glyph: '!' },
  { to: '/character', label: 'Character', glyph: '☺' },
  { to: '/settings', label: 'Settings', glyph: '⚙' },
];

export function TabBar() {
  return (
    <nav className={styles.bar} aria-label="Main navigation">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}
        >
          <span className={styles.glyph} aria-hidden="true">
            {tab.glyph}
          </span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
