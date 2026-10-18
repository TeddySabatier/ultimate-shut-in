import type { CSSProperties } from 'react';
import { getHabit, strings, TRUST_MAX, vassalXpToNext, waitingLine, type HabitId, type Vassal } from '../game';
import { vassalPortraits } from '../assets';
import { cx } from '../utils/cx';
import { Sprite } from './Icon';
import { Meter } from './Meter';
import styles from './VassalCard.module.css';

interface StripProps {
  variant: 'strip';
  vassal: Vassal;
  onReRecruit?: ((habit: HabitId) => void) | undefined;
}

interface DetailProps {
  variant: 'detail';
  vassal: Vassal;
  expanded: boolean;
  onToggle: () => void;
  onReRecruit?: ((habit: HabitId) => void) | undefined;
  benevolent: boolean;
  today: number;
}

type VassalCardProps = StripProps | DetailProps;

/** Portrait with a loyalty ring and a level badge; silhouette when away. */
function Portrait({ vassal, size }: { vassal: Vassal; size: number }) {
  const habit = getHabit(vassal.habit);
  const vars = { '--habit': habit.color, '--loyalty': `${vassal.away ? 0 : vassal.loyalty}%` } as CSSProperties;
  return (
    <span className={cx(styles.portraitWrap, vassal.away && styles.away)} style={vars}>
      <Sprite src={vassal.away ? vassalPortraits.silhouette : vassalPortraits[vassal.habit]} alt="" size={size} className={styles.portrait} />
      <span className={styles.levelBadge} aria-label={`Level ${vassal.level}`}>
        L{vassal.level}
      </span>
    </span>
  );
}

export function VassalCard(props: VassalCardProps) {
  const { vassal } = props;
  const habit = getHabit(vassal.habit);
  const name = habit.vassal.name;

  if (props.variant === 'strip') {
    return (
      <div className={cx(styles.strip, vassal.away && styles.stripAway)} style={{ '--habit': habit.color } as CSSProperties}>
        <Portrait vassal={vassal} size={56} />
        <span className={styles.stripName}>{name}</span>
        <span className="srOnly">
          {habit.label}, level {vassal.level}, {vassal.away ? 'away' : `loyalty ${Math.round(vassal.loyalty)} of 100`}
        </span>
        {vassal.away && props.onReRecruit ? (
          <button type="button" className="btn btn--sm" onClick={() => props.onReRecruit?.(vassal.habit)}>
            Re-recruit
          </button>
        ) : null}
      </div>
    );
  }

  const { expanded, onToggle, onReRecruit, benevolent, today } = props;
  const xpMax = vassalXpToNext(vassal.level);
  return (
    <div className={cx(styles.detail, vassal.away && styles.stripAway)} style={{ '--habit': habit.color } as CSSProperties}>
      <button type="button" className={styles.detailHead} aria-expanded={expanded} onClick={onToggle}>
        <Portrait vassal={vassal} size={48} />
        <span className={styles.detailTitle}>
          <span className={styles.detailName}>
            {name} <span className={styles.epithet}>{habit.vassal.epithet}</span>
          </span>
          <span className={cx('muted', styles.detailSub)}>
            {habit.label} · L{vassal.level}
            {vassal.away ? ' · away' : ` · ${strings.ui.loyalty} ${Math.round(vassal.loyalty)}`}
          </span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? '-' : '+'}
        </span>
      </button>
      {expanded ? (
        <div className={styles.detailBody}>
          <p className={styles.personality}>{habit.vassal.personality}</p>
          <dl className={styles.stats}>
            <div>
              <dt>Level {vassal.level}</dt>
              <dd>
                <Meter value={vassal.xp} max={xpMax} label={`${name} XP`} tone="xp" size="sm" />
              </dd>
            </div>
            <div>
              <dt>{strings.ui.trust}</dt>
              <dd>
                <span className={styles.trust} role="img" aria-label={`Trust ${vassal.trust} of ${TRUST_MAX}`}>
                  {Array.from({ length: TRUST_MAX }, (_, i) => (
                    <span key={i} className={cx(styles.dot, i < vassal.trust && styles.dotOn)} />
                  ))}
                </span>
              </dd>
            </div>
            <div>
              <dt>{strings.ui.loyalty}</dt>
              <dd>
                <Meter value={vassal.loyalty} max={100} label={`${name} loyalty`} tone="loyalty" size="sm" />
              </dd>
            </div>
            <div>
              <dt>Lifetime quests</dt>
              <dd className="mono">{vassal.lifetimeQuests}</dd>
            </div>
          </dl>
          {vassal.away ? (
            <div className={styles.awayRow}>
              <span>{name} is away. The seat is kept.</span>
              {onReRecruit ? (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => onReRecruit(vassal.habit)}>
                  {strings.ui.recruit}
                </button>
              ) : null}
            </div>
          ) : benevolent && vassal.loyalty < 20 ? (
            <p className={cx('muted', styles.waiting)}>{waitingLine(vassal.habit, today)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
