import { useId, useState, type FormEvent } from 'react';
import {
  COMPASS_DIRS,
  HABIT_IDS,
  OUTPOST_NAME_MAX,
  OUTPOST_NOTE_MAX,
  getHabit,
  outpostTypes,
  rings,
  strings,
  suggestOutpostCell,
  type Compass,
  type HabitId,
  type MapCell,
  type Outpost,
  type OutpostTypeId,
  type SaveFile,
} from '../../game';
import { outpostIcons } from '../../assets';
import { Icon } from '../../components/Icon';
import { mapNotice } from '../../state/gameStore';
import { cx } from '../../utils/cx';
import { MapSheet } from './MapSheet';
import styles from './sheets.module.css';

const f = strings.map.form;

export interface OutpostFormValues {
  name: string;
  type: OutpostTypeId;
  habits: HabitId[];
  note: string;
  /** The chosen cell (new outposts, or an edit that moves). */
  cell: MapCell | null;
}

interface OutpostFormProps {
  save: SaveFile;
  open: boolean;
  /** The outpost being edited, or null for a new one. */
  editing: Outpost | null;
  onClose: () => void;
  /** Returns false (with the store's notice) when the engine refused. */
  onSubmit: (values: OutpostFormValues) => boolean;
}

function defaultsFor(type: OutpostTypeId): HabitId[] {
  return [...(outpostTypes.find((t) => t.id === type)?.habits ?? [])];
}

/**
 * Mark or edit an outpost (CITY-MAP 3.1): name, type, related habits, how
 * far it feels (a zone), which way (a compass direction) and a note. The
 * engine picks the free cell; no address, no GPS.
 */
export function OutpostForm({ save, open, editing, onClose, onSubmit }: OutpostFormProps) {
  return (
    <MapSheet
      open={open}
      kick={editing ? f.editKick : f.kick}
      title={editing ? f.editTitle.replace('{name}', editing.name) : f.title}
      titleId="outpost-form-title"
      onClose={onClose}
    >
      {open ? <FormBody save={save} editing={editing} onClose={onClose} onSubmit={onSubmit} /> : null}
    </MapSheet>
  );
}

function FormBody({ save, editing, onSubmit }: Omit<OutpostFormProps, 'open'>) {
  const ids = useId();
  const ring = save.player.ring;
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<OutpostTypeId>(editing?.type ?? 'gym');
  const [habits, setHabits] = useState<HabitId[]>(editing?.habits ?? defaultsFor('gym'));
  const [zone, setZone] = useState<number>(Math.min(7, ring + 1));
  const [dir, setDir] = useState<Compass>('n');
  const [note, setNote] = useState(editing?.note ?? '');
  const [move, setMove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeDef = outpostTypes.find((t) => t.id === type);

  const pickType = (t: OutpostTypeId) => {
    setType(t);
    setHabits(defaultsFor(t));
  };
  const toggleHabit = (h: HabitId) => {
    setHabits((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : prev.length >= 2 ? [prev[1]!, h] : [...prev, h]));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim() === '') {
      setError(mapNotice(save, 'name required'));
      return;
    }
    if (habits.length === 0) {
      setError(mapNotice(save, 'pick a habit'));
      return;
    }
    let cell: MapCell | null = null;
    if (!editing || move) {
      cell = suggestOutpostCell(save, zone, dir, editing?.id);
      if (!cell) {
        const zoneCell = { x: 0, y: zone === 2 ? 1 : zone === 3 ? 2 : zone === 4 ? 3 : zone === 5 ? 4 : zone === 6 ? 6 : 8 };
        setError(mapNotice(save, 'no free cell', { cell: zoneCell }));
        return;
      }
    }
    if (!onSubmit({ name, type, habits, note, cell })) setError(null);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {!editing ? <p className={cx('muted', styles.note)}>{f.intro}</p> : null}
      <label htmlFor={`${ids}-name`} className={styles.label}>
        {f.name}
      </label>
      <input id={`${ids}-name`} type="text" value={name} maxLength={OUTPOST_NAME_MAX} placeholder={typeDef?.placeholder} autoComplete="off" onChange={(e) => setName(e.target.value)} />

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{f.type}</legend>
        <div className={styles.typeGrid} role="radiogroup" aria-label={f.type}>
          {outpostTypes.map((t) => (
            <label key={t.id} className={cx(styles.typeOption, type === t.id && styles.typeOn)}>
              <input type="radio" name={`${ids}-type`} value={t.id} checked={type === t.id} onChange={() => pickType(t.id)} className={styles.typeInput} />
              <Icon src={outpostIcons[t.id]} size={22} className={styles.typeIcon} />
              <span className={styles.typeLabel}>{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{f.habits}</legend>
        <p className={cx('muted', styles.hint)}>{f.habitsHint}</p>
        <div className={styles.habitGrid}>
          {HABIT_IDS.map((h) => {
            const on = habits.includes(h);
            return (
              <label key={h} className={cx(styles.habitOption, on && styles.habitOn)}>
                <input type="checkbox" checked={on} onChange={() => toggleHabit(h)} className={styles.typeInput} />
                <span>{getHabit(h).label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {editing ? (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
          <span>{f.move}</span>
        </label>
      ) : null}
      {!editing || move ? (
        <div className={styles.two}>
          <div>
            <label htmlFor={`${ids}-zone`} className={styles.label}>
              {f.zone}
            </label>
            <select id={`${ids}-zone`} value={zone} onChange={(e) => setZone(Number(e.target.value))}>
              {rings.slice(1).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.id > ring ? ` ${f.beyondOption}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-dir`} className={styles.label}>
              {f.direction}
            </label>
            <select id={`${ids}-dir`} value={dir} onChange={(e) => setDir(e.target.value as Compass)}>
              {COMPASS_DIRS.map((d) => (
                <option key={d} value={d}>
                  {f.directions[d]}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <label htmlFor={`${ids}-note`} className={styles.label}>
        {f.note}
      </label>
      <input id={`${ids}-note`} type="text" value={note} maxLength={OUTPOST_NOTE_MAX} placeholder={f.notePlaceholder} autoComplete="off" onChange={(e) => setNote(e.target.value)} />

      <p className={styles.err} role="alert">
        {error ?? ''}
      </p>
      <div className={styles.actions}>
        <button type="submit" className="btn btn--primary">
          {editing ? f.save : f.submit}
        </button>
      </div>
    </form>
  );
}
