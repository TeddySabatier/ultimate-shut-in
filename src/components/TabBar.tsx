import { NavLink } from 'react-router-dom';
import { strings } from '../game';
import { uiIcons } from '../assets';
import { Icon } from './Icon';
import styles from './TabBar.module.css';

interface Tab {
  to: string;
  label: string;
  icon: string;
}

const TABS: readonly Tab[] = [
  { to: '/', label: strings.ui.home, icon: uiIcons.home },
  { to: '/quests', label: strings.ui.quests, icon: uiIcons.quests },
  { to: '/character', label: strings.ui.character, icon: uiIcons.character },
  { to: '/settings', label: strings.ui.settings, icon: uiIcons.settings },
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
          <Icon src={tab.icon} size="1.375rem" className={styles.icon} />
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
