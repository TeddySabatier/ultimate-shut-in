import { useId, useState, type FormEvent } from 'react';
import {
  comboRules,
  countedCombos,
  getCombo,
  getRing,
  HABIT_IDS,
  NAME_MAX_LENGTH,
  ringName,
  rings,
  strings,
  titles,
  vassalName,
  type HabitId,
  type ResurrectionChoice,
} from '../game';
import { uiIcons } from '../assets';
import { useGameStore, useSave } from '../state/gameStore';
import { describeCondition, monsterForRecord, offerFor, playerXpProgress, todayIndex } from '../state/selectors';
import { useNow } from '../hooks/useNow';
import { cx } from '../utils/cx';
import { fmtNum } from '../utils/format';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Meter } from '../components/Meter';
import { SystemWindow } from '../components/SystemWindow';
import { MyQuestsSection } from '../components/MyQuestsSection';
import { OutpostsSection } from '../components/OutpostsSection';
import { VassalCard } from '../components/VassalCard';
import styles from './CharacterScreen.module.css';

const RESULT_LABEL = { decisive: 'decisive', win: 'held', loss: 'held (not repelled)', quiet: 'quiet' } as const;

function NameEditor({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onRename(draft);
    setEditing(false);
  };
  if (!editing) {
    return (
      <div className={styles.nameRow}>
        <span className={styles.name}>{name}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }
  return (
    <form className={styles.nameRow} onSubmit={submit}>
      <label htmlFor={id} className="srOnly">
        Name
      </label>
      <input id={id} type="text" value={draft} maxLength={NAME_MAX_LENGTH} onChange={(e) => setDraft(e.target.value)} autoFocus />
      <button type="submit" className="btn btn--primary btn--sm">
        Save
      </button>
      <button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

export function CharacterScreen() {
  const save = useSave();
  const rename = useGameStore((s) => s.rename);
  const reRecruit = useGameStore((s) => s.reRecruit);
  const resurrect = useGameStore((s) => s.resurrect);
  const addCustomToBoard = useGameStore((s) => s.addCustomToBoard);
  const archiveCustom = useGameStore((s) => s.archiveCustom);
  const restoreOutpost = useGameStore((s) => s.restoreOutpost);
  const forgetOutpost = useGameStore((s) => s.forgetOutpost);
  const now = useNow(false);
  const today = todayIndex(save, now);
  const xp = playerXpProgress(save);
  const [openVassal, setOpenVassal] = useState<HabitId | null>(null);
  const [openWave, setOpenWave] = useState<number | null>(null);
  const [pendingChoice, setPendingChoice] = useState<ResurrectionChoice | null>(null);

  const earned = new Map(save.titles.map((t) => [t.titleId, t] as const));
  const vassals = HABIT_IDS.filter((h) => save.settings.enabledHabits.includes(h)).map((h) => save.vassals[h]);
  const counted = new Set(countedCombos(save).map((c) => c.item.comboId));
  const waves = [...save.week.history].slice(-8).reverse();
  const offer = offerFor(save, now);
  const restorable = offer.streak !== null || offer.vassals.length > 0;
  const s = save.stats;
  const unlockedRings = rings.filter((r) => r.id <= save.player.ring);

  return (
    <>
      <h1>The Ledger</h1>

      <SystemWindow title="The Absolute">
        <NameEditor name={save.player.name} onRename={rename} />
        <dl className={styles.facts}>
          <div>
            <dt>Level {save.player.level}</dt>
            <dd>
              <Meter value={xp.value} max={xp.max} label="XP to next level" tone="xp" caps />
            </dd>
          </div>
          <div>
            <dt>{strings.ui.settlement}</dt>
            <dd className={styles.inline}>
              <Icon src={uiIcons.coin} size={16} className={styles.coin} /> <span className="mono">{fmtNum(save.player.coins)}</span>
            </dd>
          </div>
          <div>
            <dt>{strings.ui.domainPoints}</dt>
            <dd className={styles.inline}>
              <Icon src={uiIcons.domainPoint} size={16} className={styles.dp} /> <span className="mono">{fmtNum(save.player.domainPoints)}</span> ·{' '}
              {ringName(save.player.ring)}
            </dd>
          </div>
        </dl>

        <h3 className={styles.subhead}>
          Titles ({save.titles.length}/{titles.length})
        </h3>
        <ul className={styles.titles}>
          {titles.map((t) => {
            const got = earned.get(t.id);
            return (
              <li key={t.id} className={cx(styles.title, got ? styles.titleOn : styles.titleLocked)} title={got ? t.flavor : describeCondition(t.condition)}>
                <Icon src={got ? uiIcons.titleBadge : uiIcons.lock} size={18} />
                <span className={styles.titleText}>
                  <span className={styles.titleName}>{t.name}</span>
                  <span className={cx('muted', styles.titleSub)}>{got ? t.flavor : describeCondition(t.condition)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </SystemWindow>

      <SystemWindow title="Vassals">
        {vassals.map((v) => (
          <VassalCard
            key={v.habit}
            variant="detail"
            vassal={v}
            expanded={openVassal === v.habit}
            onToggle={() => setOpenVassal(openVassal === v.habit ? null : v.habit)}
            onReRecruit={reRecruit}
            benevolent={save.settings.benevolence === 'benevolent'}
            today={today}
          />
        ))}
      </SystemWindow>

      <MyQuestsSection save={save} onAddToday={addCustomToBoard} onArchive={archiveCustom} />

      <OutpostsSection save={save} now={now} onRestore={restoreOutpost} onForget={forgetOutpost} />

      <SystemWindow title="Forged this period">
        {save.player.ring < comboRules.minRing ? (
          <p className="muted">The Improvised Forge opens with {ringName(comboRules.minRing)}.</p>
        ) : save.combos.length === 0 ? (
          <p className="muted">Nothing on the bench. Two habits done in one day forge an item.</p>
        ) : (
          <ul className={styles.combos}>
            {save.combos.map((c) => {
              const def = getCombo(c.comboId);
              return (
                <li key={c.comboId} className={cx(styles.combo, def?.legendary && styles.legendary)}>
                  <Icon src={uiIcons.comboWeapon} size={18} />
                  <span className={styles.comboText}>
                    <span>
                      {def?.name ?? c.comboId} <span className="mono">+{c.power}</span>
                      {!counted.has(c.comboId) ? <span className="muted"> (bench)</span> : null}
                    </span>
                    {def ? <span className={cx('muted', styles.comboFlavor)}>{def.flavor}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SystemWindow>

      <SystemWindow title="Waves">
        {waves.length === 0 ? (
          <p className="muted">No wave has reached the gate yet.</p>
        ) : (
          <ul className={styles.waves}>
            {waves.map((w) => {
              const open = openWave === w.index;
              return (
                <li key={w.index} className={styles.wave}>
                  <button type="button" className={styles.waveHead} aria-expanded={open} onClick={() => setOpenWave(open ? null : w.index)}>
                    <span>
                      Wave {w.index + 1} · {RESULT_LABEL[w.result]}
                    </span>
                    <span className="mono">
                      {w.defense} vs {w.attack}
                    </span>
                  </button>
                  {open ? (
                    <div className={styles.waveBody}>
                      <p className="muted">
                        {ringName(w.ring)} · {monsterForRecord(save, w.index).name} · +{w.dpAwarded} DP
                      </p>
                      {w.result !== 'quiet' ? (
                        <p className={cx('muted', styles.breakdown)}>
                          Vassals +{w.breakdown.vassals} · Trust +{w.breakdown.trust} · Walls +{w.breakdown.walls} · Items +{w.breakdown.combos} · Titles +
                          {w.breakdown.titles} · Well-kept +{w.breakdown.wellKept}
                          {w.breakdown.outposts > 0 ? ` · Outposts +${w.breakdown.outposts}` : ''}
                        </p>
                      ) : null}
                      <ol className={cx('mono', styles.log)}>
                        {w.log.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SystemWindow>

      <SystemWindow title="Lifetime">
        <dl className={styles.stats}>
          <div>
            <dt>Quests settled</dt>
            <dd className="mono">{fmtNum(s.questsTotal)}</dd>
          </div>
          <div>
            <dt>Quest days</dt>
            <dd className="mono">{fmtNum(s.questDaysTotal)}</dd>
          </div>
          <div>
            <dt>Current run</dt>
            <dd className="mono">{s.questDayStreak} days</dd>
          </div>
          <div>
            <dt>Best run</dt>
            <dd className="mono">{s.bestQuestDayStreak} days</dd>
          </div>
          <div>
            <dt>Waves held</dt>
            <dd className="mono">{s.waveWins}</dd>
          </div>
          <div>
            <dt>Waves not repelled</dt>
            <dd className="mono">{s.waveLosses}</dd>
          </div>
          <div>
            <dt>Items forged</dt>
            <dd className="mono">{s.combosForged}</dd>
          </div>
          <div>
            <dt>Welcomed back</dt>
            <dd className="mono">{s.reRecruitments}</dd>
          </div>
        </dl>
      </SystemWindow>

      <SystemWindow title="Story">
        <p className="muted">Replay the dispatches.</p>
        {unlockedRings.map((r) => (
          <details key={r.id} className={styles.story}>
            <summary className={styles.storySummary}>{r.name}</summary>
            <p className={styles.vignette}>{getRing(r.id).vignette}</p>
          </details>
        ))}
      </SystemWindow>

      {restorable ? (
        <SystemWindow title="Resurrection token" tone="accent">
          <p className={styles.inline}>
            <Icon src={uiIcons.resurrectionToken} size={20} className={styles.token} />
            <span>{strings.resurrection.offer.replace('{coins}', fmtNum(offer.price))}</span>
          </p>
          {!offer.availableThisMonth ? <p className="muted">{strings.resurrection.unavailable}</p> : null}
          {offer.availableThisMonth && !offer.affordable ? <p className="muted">Not enough settlement yet. Nothing expires in a hurry.</p> : null}
          <div className={styles.offerActions}>
            {offer.streak ? (
              <button
                type="button"
                className="btn"
                disabled={!offer.availableThisMonth || !offer.affordable}
                onClick={() => setPendingChoice({ kind: 'streak' })}
              >
                Restore the {offer.streak.length}-day run
              </button>
            ) : null}
            {offer.vassals.map((h) => (
              <button
                key={h}
                type="button"
                className="btn"
                disabled={!offer.availableThisMonth || !offer.affordable}
                onClick={() => setPendingChoice({ kind: 'vassal', habit: h })}
              >
                Bring back {vassalName(h)}
              </button>
            ))}
          </div>
        </SystemWindow>
      ) : null}

      <ConfirmDialog
        open={pendingChoice !== null}
        title="Use the token?"
        confirmLabel={`Pay ${fmtNum(offer.price)}`}
        onCancel={() => setPendingChoice(null)}
        onConfirm={() => {
          if (pendingChoice) resurrect(pendingChoice);
          setPendingChoice(null);
        }}
      >
        <p>
          {pendingChoice?.kind === 'vassal'
            ? `${vassalName(pendingChoice.habit)} returns to the Haven.`
            : `The ${offer.streak?.length ?? 0}-day run is written back into the Ledger.`}{' '}
          The token is spent for this month.
        </p>
      </ConfirmDialog>
    </>
  );
}
