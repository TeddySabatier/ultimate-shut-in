import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  HABIT_IDS,
  MAX_DURATION_MIN,
  MAX_TARGET_COUNT,
  WEEKDAY_NAMES,
  activeOutposts,
  cleanDraft,
  customSlotsLeft,
  effortTier,
  formatLine,
  getHabit,
  maxTier,
  parseQuestDraft,
  previewCustomRewards,
  recurrenceLabel,
  relatedOutposts,
  resolveTier,
  strings,
  vassalName,
  type CustomDraft,
  type HabitId,
  type QuestKind,
  type Recurrence,
  type Tier,
  type TimeSlot,
} from '../game';
import { uiIcons, vassalPortraits } from '../assets';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useGameStore, useSave } from '../state/gameStore';
import { cx } from '../utils/cx';
import { RewardChips } from '../components/Chips';
import { Icon, Sprite } from '../components/Icon';
import { SystemWindow } from '../components/SystemWindow';
import styles from './ComposeQuestSheet.module.css';

const c = strings.compose;
const KINDS: readonly QuestKind[] = ['check', 'timer', 'count'];
const SLOTS: readonly TimeSlot[] = ['any', 'morning', 'afternoon', 'evening'];
const DEFAULT_DURATION = 15;
const DEFAULT_TARGET = 5;
/** Monday first, the way a week reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Recurrence as one `<select>` value: the plain ones, `weekly:N`, or `pin:<weekday>`. */
type RecurrenceKey = 'once' | 'daily' | 'weekdays' | `weekly:${number}` | `pin:${number}`;

function keyOf(recurrence: Recurrence, pin: number | undefined): RecurrenceKey {
  return recurrence === 'weekly:1' && pin !== undefined ? `pin:${pin}` : recurrence;
}

function fromKey(key: RecurrenceKey): { recurrence: Recurrence; pinWeekday: number | undefined } {
  if (key.startsWith('pin:')) return { recurrence: 'weekly:1', pinWeekday: Number(key.slice(4)) };
  return { recurrence: key as Recurrence, pinWeekday: undefined };
}

const RECURRENCE_OPTIONS: { value: RecurrenceKey; label: string }[] = [
  { value: 'once', label: recurrenceLabel('once') },
  { value: 'daily', label: recurrenceLabel('daily') },
  { value: 'weekdays', label: recurrenceLabel('weekdays') },
  ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({ value: `weekly:${n}` as RecurrenceKey, label: recurrenceLabel(`weekly:${n}`) })),
  ...WEEK_ORDER.map((d) => ({ value: `pin:${d}` as RecurrenceKey, label: `Every ${WEEKDAY_NAMES[d] ?? ''}` })),
];

/** What the player changed by hand; anything not here follows the parsed sentence. */
interface Edits {
  habit?: HabitId;
  kind?: QuestKind;
  duration?: string;
  target?: string;
  title?: string;
  recurrence?: RecurrenceKey;
  timeSlot?: TimeSlot;
  tier?: Tier;
  /** Outpost that settling it counts as a visit to; '' for none. */
  outpostId?: string;
}

function wholeNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

interface BodyProps {
  titleId: string;
  onClose: () => void;
}

function SheetBody({ titleId, onClose }: BodyProps) {
  const save = useSave();
  const composeQuest = useGameStore((s) => s.composeQuest);
  const clearNotice = useGameStore((s) => s.clearNotice);
  const ids = useId();
  const [text, setText] = useState('');
  const [usedVoice, setUsedVoice] = useState(false);
  const [heard, setHeard] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';

  const speech = useSpeechRecognition(locale, (final) => {
    setText((prev) => (prev.trim() === '' ? final : `${prev.trim()} ${final}`));
    setUsedVoice(true);
    setHeard(true);
  });
  const listening = speech.status === 'listening';

  // A refused microphone or an unreachable speech service sends the player to the text box.
  useEffect(() => {
    if (speech.status === 'denied' || speech.status === 'nomic' || speech.status === 'offline' || speech.status === 'error') textRef.current?.focus();
  }, [speech.status]);

  const parsed = useMemo(() => parseQuestDraft(text, { locale }), [text, locale]);
  const hasText = text.trim() !== '';

  const habit = edits.habit ?? parsed.habit;
  const kind = edits.kind ?? parsed.kind;
  const durationText = edits.duration ?? String(parsed.durationMin ?? DEFAULT_DURATION);
  const targetText = edits.target ?? String(parsed.targetCount ?? DEFAULT_TARGET);
  const title = edits.title ?? parsed.title;
  const recurrenceKey = edits.recurrence ?? keyOf(parsed.recurrence, parsed.pinWeekday);
  const timeSlot = edits.timeSlot ?? parsed.timeSlot;
  const duration = wholeNumber(durationText);
  const target = wholeNumber(targetText);
  const { recurrence, pinWeekday } = fromKey(recurrenceKey);

  const durationArg = kind === 'timer' ? duration : undefined;
  const targetArg = kind === 'count' ? target : undefined;
  const effort = effortTier(kind, durationArg, targetArg);
  const cap = maxTier(kind, durationArg, targetArg);
  const tier = resolveTier(kind, edits.tier, durationArg, targetArg);

  const input: CustomDraft = {
    habit,
    kind,
    durationMin: durationArg,
    targetCount: targetArg,
    title,
    description: parsed.description,
    tier: edits.tier,
    recurrence,
    pinWeekday,
    timeSlot,
    source: usedVoice ? 'voice' : 'text',
    outpostId: edits.outpostId === undefined || edits.outpostId === '' ? undefined : edits.outpostId,
  };
  const checked = cleanDraft(input);
  // Related outposts first, then the rest of the map, so a gym quest finds its gym at the top.
  const outpostOptions = [...relatedOutposts(save, habit), ...activeOutposts(save).filter((o) => !o.habits.includes(habit))];
  const problem = 'error' in checked ? checked.error : null;
  const rewards = problem === null ? previewCustomRewards(save, input) : null;

  const habitOn = save.settings.enabledHabits.includes(habit);
  const away = save.vassals[habit].away;
  const slotsLeft = customSlotsLeft(save);
  const canBoard = save.board !== null && habitOn && !away && slotsLeft > 0;
  const askHabit = hasText && edits.habit === undefined && parsed.questions.some((q) => q.id === 'habit');
  const askAmount = hasText && edits.duration === undefined && edits.target === undefined && edits.kind === undefined && parsed.questions.some((q) => q.id === 'amount');
  const askTitle = hasText && edits.title === undefined && parsed.questions.some((q) => q.id === 'title');

  const set = (patch: Edits): void => {
    setEdits((e) => ({ ...e, ...patch }));
    setError(null);
  };

  const submit = (board: boolean): void => {
    if (problem !== null || !hasText) return;
    setError(null);
    if (composeQuest(input, { board })) {
      onClose();
      return;
    }
    const refused = useGameStore.getState().notice;
    clearNotice();
    setError(refused ?? 'That could not be saved.');
  };

  const voiceNote =
    speech.status === 'denied'
      ? c.denied
      : speech.status === 'nomic'
        ? c.noMic
        : speech.status === 'nospeech'
          ? c.noSpeech
          : speech.status === 'offline' || speech.status === 'error'
            ? c.offline
            : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(canBoard);
      }}
      noValidate
    >
      <SystemWindow
        as="div"
        tone="accent"
        title={<span id={titleId}>{c.title}</span>}
        className={styles.window}
        actions={
          <>
            <button type="button" className="btn" onClick={onClose}>
              {c.actions.cancel}
            </button>
            <button type="button" className="btn" disabled={!hasText || problem !== null} onClick={() => submit(false)}>
              {recurrence === 'once' ? c.actions.later : c.actions.recurring}
            </button>
            <button type="submit" className="btn btn--primary" disabled={!hasText || problem !== null || !canBoard}>
              {c.actions.board}
            </button>
          </>
        }
      >
        <p className={styles.intro}>{c.intro}</p>

        <div className={styles.capture}>
          <label htmlFor={`${ids}-text`} className={styles.label}>
            {c.textLabel}
          </label>
          <textarea
            id={`${ids}-text`}
            ref={textRef}
            className={styles.textarea}
            rows={3}
            maxLength={300}
            autoFocus
            value={text}
            placeholder={c.textPlaceholder}
            aria-describedby={`${ids}-voice`}
            onChange={(e) => {
              setText(e.target.value);
              setHeard(false);
            }}
          />
          <div className={styles.voiceRow}>
            {speech.supported ? (
              <button type="button" className={cx('btn', listening && styles.listening)} onClick={listening ? speech.stop : speech.start}>
                <Icon src={uiIcons.mic} size={18} />
                {listening ? c.stop : c.speak}
              </button>
            ) : null}
            {listening ? (
              <span className={styles.rec} role="status">
                <span className={styles.dot} aria-hidden="true" />
                {c.listening}
              </span>
            ) : null}
          </div>
          {listening && speech.interim !== '' ? (
            <p className={styles.interim} aria-live="polite">
              <span className="muted">{c.hearing}:</span> {speech.interim}
            </p>
          ) : null}
          {voiceNote !== null ? (
            <p className={styles.alert} role="alert">
              {voiceNote}
            </p>
          ) : null}
          {heard && voiceNote === null ? <p className={styles.ok}>{c.heard}</p> : null}
          <p id={`${ids}-voice`} className={cx('muted', styles.note)}>
            {speech.supported ? c.voicePrivacy : c.unsupported}
          </p>
        </div>

        {!hasText ? (
          <p className={cx('muted', styles.note)}>{c.emptyHint}</p>
        ) : (
          <div className={styles.parsed}>
            <h3 className={styles.subhead}>{c.parsedHeading}</h3>

            <ul className={styles.questions}>
              {askHabit ? <li>{c.questions.habit}</li> : null}
              {askAmount ? <li>{c.questions.amount}</li> : null}
              {askTitle ? <li>{c.questions.title}</li> : null}
            </ul>

            <fieldset className={cx(styles.group, askHabit && styles.asking)}>
              <legend className={styles.label}>{c.labels.habit}</legend>
              <div className={styles.habits}>
                {HABIT_IDS.map((h) => {
                  const def = getHabit(h);
                  const on = save.settings.enabledHabits.includes(h);
                  return (
                    <label key={h} className={cx(styles.habit, habit === h && styles.selected, !on && styles.off)} style={{ '--habit': def.color } as CSSProperties}>
                      <input type="radio" name={`${ids}-habit`} value={h} checked={habit === h} disabled={!on} onChange={() => set({ habit: h })} />
                      <Sprite src={vassalPortraits[h]} alt="" size={36} className={styles.portrait} />
                      <span className={styles.habitText}>
                        <span className={styles.habitName}>{vassalName(h)}</span>
                        <span className={styles.habitLabel}>{def.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {!habitOn ? <p className={styles.alert}>{formatLine(c.notes.habitOff, { habit: getHabit(habit).label })}</p> : null}
            {habitOn && away ? <p className={styles.alert}>{formatLine(c.notes.away, { name: vassalName(habit) })}</p> : null}

            <fieldset className={styles.group}>
              <legend className={styles.label}>{c.labels.kind}</legend>
              <div className={styles.segmented}>
                {KINDS.map((k) => (
                  <label key={k} className={cx(styles.seg, kind === k && styles.selected)}>
                    <input type="radio" name={`${ids}-kind`} value={k} checked={kind === k} onChange={() => set({ kind: k })} />
                    <span>{c.kinds[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={styles.row}>
              {kind === 'timer' ? (
                <div className={styles.field}>
                  <label htmlFor={`${ids}-duration`} className={styles.label}>
                    {c.labels.duration}
                  </label>
                  <input
                    id={`${ids}-duration`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_DURATION_MIN}
                    value={durationText}
                    onChange={(e) => set({ duration: e.target.value })}
                  />
                </div>
              ) : null}
              {kind === 'count' ? (
                <div className={styles.field}>
                  <label htmlFor={`${ids}-target`} className={styles.label}>
                    {c.labels.target}
                  </label>
                  <input id={`${ids}-target`} type="number" inputMode="numeric" min={1} max={MAX_TARGET_COUNT} value={targetText} onChange={(e) => set({ target: e.target.value })} />
                </div>
              ) : null}
              <div className={cx(styles.field, styles.wide, askTitle && styles.asking)}>
                <label htmlFor={`${ids}-name`} className={styles.label}>
                  {c.labels.name}
                </label>
                <input id={`${ids}-name`} type="text" maxLength={40} value={title} onChange={(e) => set({ title: e.target.value })} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor={`${ids}-recurrence`} className={styles.label}>
                  {c.labels.recurrence}
                </label>
                <select id={`${ids}-recurrence`} value={recurrenceKey} onChange={(e) => set({ recurrence: e.target.value as RecurrenceKey })}>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${ids}-slot`} className={styles.label}>
                  {c.labels.timeSlot}
                </label>
                <select id={`${ids}-slot`} value={timeSlot} onChange={(e) => set({ timeSlot: e.target.value as TimeSlot })}>
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {c.slots[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {outpostOptions.length > 0 ? (
              <div className={styles.row}>
                <div className={cx(styles.field, styles.wide)}>
                  <label htmlFor={`${ids}-where`} className={styles.label}>
                    {c.labels.where}
                  </label>
                  <select id={`${ids}-where`} value={edits.outpostId ?? ''} onChange={(e) => set({ outpostId: e.target.value })}>
                    <option value="">{c.whereNone}</option>
                    {outpostOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <p className={cx('muted', styles.note)}>{c.whereHint}</p>
                </div>
              </div>
            ) : null}

            <fieldset className={styles.group}>
              <legend className={styles.label}>{c.labels.tier}</legend>
              <div className={styles.segmented}>
                {([1, 2, 3] as const).map((t) => (
                  <label key={t} className={cx(styles.seg, tier === t && styles.selected, t > cap && styles.off)}>
                    <input type="radio" name={`${ids}-tier`} value={t} checked={tier === t} disabled={t > cap} onChange={() => set({ tier: t })} />
                    <span>
                      {t} {c.tiers[t - 1]}
                      {t === effort ? <span className={styles.suggested}> ({c.tierSuggested})</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              {cap < 3 ? <p className={cx('muted', styles.note)}>{formatLine(c.tierCap, { kind: c.kinds[kind].toLowerCase(), max: cap })}</p> : null}
            </fieldset>

            {problem !== null ? (
              <p className={styles.alert} role="alert">
                {problem.charAt(0).toUpperCase() + problem.slice(1)}.
              </p>
            ) : null}
            {rewards ? (
              <div className={styles.rewards}>
                <span className={styles.label}>{c.labels.rewards}</span>
                <RewardChips xp={rewards.xp} coins={rewards.coins} dp={rewards.dp} />
              </div>
            ) : null}
            {slotsLeft === 0 ? <p className={cx('muted', styles.note)}>{c.notes.full}</p> : null}
          </div>
        )}

        {error !== null ? (
          <p className={styles.alert} role="alert">
            {error.charAt(0).toUpperCase() + error.slice(1)}
          </p>
        ) : null}
      </SystemWindow>
    </form>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The Compose sheet: say or type one sentence, check what the on-device
 * parser made of it, then put it on today's board or keep it in My quests.
 * A native modal `<dialog>` (focus trap, Escape) that mounts its body only
 * while open, so every opening starts blank.
 */
export function ComposeQuestSheet({ open, onClose }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.hasAttribute('open')) {
        if (typeof d.showModal === 'function') d.showModal();
        else d.setAttribute('open', '');
      }
    } else if (d.hasAttribute('open')) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? <SheetBody titleId={titleId} onClose={onClose} /> : null}
    </dialog>
  );
}
