import { formatLine, HABIT_IDS, strings } from '../game';
import { uiIcons } from '../assets';
import { useGameStore, useSave } from '../state/gameStore';
import { encouragementLine, utilityViews, vassalLabel, waveOutlook } from '../state/selectors';
import { useNow } from '../hooks/useNow';
import { cx } from '../utils/cx';
import { Icon } from '../components/Icon';
import { Meter } from '../components/Meter';
import { RingHeader } from '../components/RingHeader';
import { SystemWindow } from '../components/SystemWindow';
import { VassalCard } from '../components/VassalCard';
import styles from './HomeScreen.module.css';

const UTILITY_ICON = { power: uiIcons.utilityPower, water: uiIcons.utilityWater, gas: uiIcons.utilityGas } as const;
const STATE_LABEL = { bright: 'Bright', flickering: 'Flickering', dim: 'Dim', out: 'Out' } as const;

export function HomeScreen() {
  const save = useSave();
  const reRecruit = useGameStore((s) => s.reRecruit);
  const now = useNow(false);
  const utilities = utilityViews(save).filter((u) => u.enabled);
  const wave = waveOutlook(save, now);
  const vassals = HABIT_IDS.filter((h) => save.settings.enabledHabits.includes(h)).map((h) => save.vassals[h]);
  const recent = save.log.slice(-8).reverse();
  const b = wave.defense.breakdown;

  return (
    <>
      <RingHeader save={save} />

      {utilities.length > 0 ? (
        <SystemWindow title="Utilities">
          <ul className={styles.utilities}>
            {utilities.map((u) => (
              <li key={u.id} className={styles.utility} data-state={u.state}>
                <span className={styles.utilityHead}>
                  <Icon src={UTILITY_ICON[u.id]} size={18} className={styles.utilityIcon} />
                  <span className={styles.utilityLabel}>{u.label}</span>
                  <span className={cx('muted', styles.utilityState)}>{STATE_LABEL[u.state]}</span>
                </span>
                <Meter value={u.value} max={100} label={u.label} tone={u.state} size="sm" hideText />
              </li>
            ))}
          </ul>
        </SystemWindow>
      ) : null}

      <SystemWindow title="Wave">
        <p className={styles.waveLine}>
          <Icon src={uiIcons.waveShield} size={18} className={styles.waveIcon} />
          <strong>{wave.daysUntil <= 1 ? strings.ui.waveToday : formatLine(strings.ui.nextWave, { days: wave.daysUntil })}</strong>
        </p>
        <p className={styles.waveEstimate}>
          Defense so far <span className="mono">{wave.defense.total}</span> · expected attack <span className="mono">{wave.attack}</span>{' '}
          <span className="muted">({wave.monster.name})</span>
        </p>
        <details className={styles.details}>
          <summary className={styles.summary}>Defense breakdown</summary>
          <ul className={styles.breakdown}>
            <li>Vassal levels +{b.vassals}</li>
            <li>Trust this week +{b.trust}</li>
            <li>Walls +{b.walls}</li>
            <li>Items +{b.combos}</li>
            <li>Titles +{b.titles}</li>
            <li>Well-kept +{b.wellKept}</li>
          </ul>
        </details>
      </SystemWindow>

      <SystemWindow title="Vassals">
        <div className={styles.strip} role="list" aria-label="Vassals" tabIndex={0}>
          {vassals.map((v) => (
            <div key={v.habit} role="listitem" aria-label={vassalLabel(v.habit)}>
              <VassalCard variant="strip" vassal={v} onReRecruit={reRecruit} />
            </div>
          ))}
        </div>
      </SystemWindow>

      <SystemWindow title="Recent log">
        {recent.length === 0 ? (
          <p className="muted">The Ledger is open to a clean page.</p>
        ) : (
          <ul className={styles.log}>
            {recent.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className={styles.logEntry}>
                {entry.text}
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>

      <p className={cx('muted', styles.encouragement)}>{encouragementLine(save, now)}</p>
    </>
  );
}
