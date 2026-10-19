import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  COMPASS_DIRS,
  HABIT_IDS,
  ISLAND_RADIUS,
  OUTPOST_NAME_MAX,
  OUTPOST_NOTE_MAX,
  ZONE_RADII,
  getHabit,
  islandCells,
  outpostTypes,
  placementError,
  rings,
  strings,
  suggestOutpostCell,
  zoneOfCell,
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
 * selects pick a free cell; optional amber dots let a tap set it. No address,
 * no GPS. Keyboard users never need the dots.
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
  const [picked, setPicked] = useState<MapCell | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typeDef = outpostTypes.find((t) => t.id === type);
  const except = editing?.id;
  const placing = !editing || move;
  const suggested = placing ? suggestOutpostCell(save, zone, dir, except) : null;
  const freeCells = useMemo(() => {
    if (!placing) return [];
    return islandCells().filter((c) => zoneOfCell(c) === zone && placementError(save, c, except) === null);
  }, [save, zone, except, placing]);

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
      cell = picked ?? suggestOutpostCell(save, zone, dir, editing?.id);
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
        <>
          <div className={styles.two}>
            <div>
              <label htmlFor={`${ids}-zone`} className={styles.label}>
                {f.zone}
              </label>
              <select
                id={`${ids}-zone`}
                value={zone}
                onChange={(e) => {
                  setZone(Number(e.target.value));
                  setPicked(null);
                }}
              >
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
              <select
                id={`${ids}-dir`}
                value={dir}
                onChange={(e) => {
                  setDir(e.target.value as Compass);
                  setPicked(null);
                }}
              >
                {COMPASS_DIRS.map((d) => (
                  <option key={d} value={d}>
                    {f.directions[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {freeCells.length > 0 ? (
            <PlaceDots cells={freeCells} suggested={suggested} picked={picked} onPick={setPicked} />
          ) : null}
        </>
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

const PLACE_S = 6.5;
const PLACE_CX = 100;
const PLACE_CY = 92;
const PLACE_W = 200;
const PLACE_H = 150;

interface PlaceDotsProps {
  cells: MapCell[];
  suggested: MapCell | null;
  picked: MapCell | null;
  onPick: (cell: MapCell) => void;
}

/** Tiny isometric island of free cells. Pointer-only; not in the tab order. */
function PlaceDots({ cells, suggested, picked, onPick }: PlaceDotsProps) {
  const rx = ISLAND_RADIUS * PLACE_S * Math.SQRT2;
  const ry = rx / 2;
  const chosen = picked ?? suggested;
  return (
    <div className={styles.place}>
      <p className={styles.label}>{f.place}</p>
      <p className={cx('muted', styles.hint)}>{picked ? f.placed : f.placeHint}</p>
      <svg className={styles.placeSvg} viewBox={`0 0 ${PLACE_W} ${PLACE_H}`} aria-hidden="true" focusable="false">
        <ellipse cx={PLACE_CX} cy={PLACE_CY} rx={rx} ry={ry} className={styles.placeIsland} />
        {ZONE_RADII.map((r, i) => (
          <ellipse
            key={r}
            cx={PLACE_CX}
            cy={PLACE_CY}
            rx={r * PLACE_S * Math.SQRT2}
            ry={(r * PLACE_S * Math.SQRT2) / 2}
            className={styles.placeRing}
            opacity={i === 0 ? 0.9 : 0.35}
          />
        ))}
        {cells.map((c) => {
          const x = PLACE_CX + (c.x - c.y) * PLACE_S;
          const y = PLACE_CY + ((c.x + c.y) * PLACE_S) / 2;
          const on = chosen !== null && chosen.x === c.x && chosen.y === c.y;
          return (
            <circle
              key={`${c.x},${c.y}`}
              cx={x}
              cy={y}
              r={on ? 5.5 : 4}
              className={on ? styles.placeDotOn : styles.placeDot}
              data-place-cell={`${c.x},${c.y}`}
              onClick={() => onPick(c)}
            />
          );
        })}
      </svg>
    </div>
  );
}
