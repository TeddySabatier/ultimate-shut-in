import { useCallback, useEffect, useMemo, useState } from 'react';
import { fnv1a, strings } from '../game';
import { outpostIcons, uiIcons } from '../assets';
import { useGameStore, useSave } from '../state/gameStore';
import { mapView, type OutpostView } from '../state/mapView';
import { useNow } from '../hooks/useNow';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { cx } from '../utils/cx';
import { fmtNum } from '../utils/format';
import { Icon } from '../components/Icon';
import { Meter } from '../components/Meter';
import { SystemWindow } from '../components/SystemWindow';
import { CityMapSvg, type PinView, type ZoneBand } from '../components/map/CityMapSvg';
import { MapListView } from './map/MapListView';
import { OutpostForm, type OutpostFormValues } from './map/OutpostForm';
import { OutpostSheet } from './map/OutpostSheet';
import { ZoneSheet } from './map/ZoneSheet';
import styles from './MapScreen.module.css';

const m = strings.map;
const LIST_KEY = 'haven.mapList';

type Sheet = { kind: 'zone'; zone: number } | { kind: 'pin'; id: string } | { kind: 'new' } | { kind: 'edit'; id: string } | null;

function readListPref(): boolean {
  try {
    return localStorage.getItem(LIST_KEY) === '1';
  } catch {
    return false;
  }
}

function writeListPref(on: boolean): void {
  try {
    localStorage.setItem(LIST_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function zoneStatusText(z: ReturnType<typeof mapView>['zones'][number]): string {
  if (z.status === 'claimed') return m.list.claimed.toLowerCase();
  if (z.status === 'current') return m.outposts.current.toLowerCase();
  if (z.status === 'next') return `next ring, ${m.zone.toGo.replace('{dp}', fmtNum(z.dpToGo))}`;
  return m.list.beyond.toLowerCase();
}

/** The City Map tab (docs/design/CITY-MAP.md 2, 5). */
export function MapScreen() {
  const save = useSave();
  const now = useNow(true, 60_000);
  const reduced = useReducedMotion();
  const markMapSeen = useGameStore((s) => s.markMapSeen);
  const createOutpost = useGameStore((s) => s.createOutpost);
  const editOutpost = useGameStore((s) => s.editOutpost);
  const moveOutpost = useGameStore((s) => s.moveOutpost);
  const retireOutpost = useGameStore((s) => s.retireOutpost);
  const visitOutpost = useGameStore((s) => s.visitOutpost);
  const undoOutpostVisit = useGameStore((s) => s.undoOutpostVisit);
  const view = useMemo(() => mapView(save, now), [save, now]);
  // The wall animates from where it stood at the last look; the look is recorded on leaving (unmount or hiding).
  const [opening] = useState(() => ({ wallR: view.prevWallR, ring: save.map.lastSeen ? Math.min(view.ring, Math.max(1, view.ring - (view.prevWallR < view.wallR ? 1 : 0))) : view.ring }));
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') markMapSeen();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      markMapSeen();
    };
  }, [markMapSeen]);

  const [list, setList] = useState(readListPref);
  const [compare, setCompare] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = useCallback(() => setSheet(null), []);

  const pins: PinView[] = useMemo(
    () =>
      view.outposts.map((o) => ({
        id: o.outpost.id,
        name: o.outpost.name,
        type: o.outpost.type,
        typeLabel: o.type.label,
        cell: o.outpost.cell,
        state: o.state,
        stateLabel: o.stateLabel,
        quiet: o.quiet,
        zone: o.zone,
        beyond: o.beyond,
        visits: o.outpost.visits,
      })),
    [view.outposts],
  );
  const bands: ZoneBand[] = useMemo(
    () => view.zones.map((z) => ({ id: z.id, label: m.a11y.zoneBand.replace('{zone}', String(z.id)).replace('{name}', z.name).replace('{status}', zoneStatusText(z)) })),
    [view.zones],
  );
  const seed = fnv1a(String(save.firstPlayDay));
  const selectedPin = sheet?.kind === 'pin' || sheet?.kind === 'edit' ? sheet.id : null;
  const selectedZone = sheet?.kind === 'zone' ? sheet.zone : null;
  const openZone = useCallback((zone: number) => setSheet({ kind: 'zone', zone }), []);
  const openPin = useCallback((id: string) => setSheet({ kind: 'pin', id }), []);
  const byId = (id: string | null): OutpostView | null => (id ? (view.outposts.find((o) => o.outpost.id === id) ?? view.retired.find((o) => o.outpost.id === id) ?? null) : null);

  const onFormSubmit = (values: OutpostFormValues): boolean => {
    if (sheet?.kind === 'edit') {
      const ok = editOutpost(sheet.id, { name: values.name, type: values.type, habits: values.habits, note: values.note });
      if (!ok) return false;
      if (values.cell && !moveOutpost(sheet.id, values.cell)) return false;
      setSheet({ kind: 'pin', id: sheet.id });
      return true;
    }
    if (!values.cell) return false;
    const ok = createOutpost({ name: values.name, type: values.type, habits: values.habits, note: values.note, cell: values.cell });
    if (ok) close();
    return ok;
  };

  const sinceLine = compare
    ? view.compare.gainedDp > 0
      ? m.since.compare.replace('{dp}', fmtNum(view.compare.gainedDp)).replace('{streets}', String(view.compare.streets))
      : m.since.compareNone
    : view.sinceDp > 0
      ? m.since.gain.replace('{dp}', fmtNum(view.sinceDp))
      : m.since.same;

  return (
    <>
      <header className={styles.top}>
        <div className={styles.title}>
          <h1 className={styles.h1}>{m.title}</h1>
          <p className={styles.ringLine}>{m.ringLine.replace('{ring}', String(view.ring)).replace('{name}', view.ringName)}</p>
        </div>
        <div className={styles.dpChip} aria-label={`${fmtNum(view.dp)} ${strings.ui.domainPoints}`}>
          <Icon src={uiIcons.domainPoint} size={20} className={styles.dpIcon} />
          <span className={cx('mono', styles.dpValue)}>{fmtNum(view.dp)}</span>
          <span className={styles.dpUnit} aria-hidden="true">
            DP
          </span>
        </div>
      </header>

      <div className={styles.cols}>
        <div className={styles.colA}>
          <section className={styles.mapCard} aria-label="The city map">
            <div className={styles.hud}>
              <span className={styles.waveChip}>
                {view.nextWaveDays <= 1 ? (
                  <b>{m.hud.waveTonight}</b>
                ) : (
                  <>
                    <span>{m.hud.nextWave.split('{days}')[0]}</span>
                    <b>
                      {view.nextWaveDays}
                      {m.hud.nextWave.split('{days}')[1]}
                    </b>
                  </>
                )}
              </span>
              <div className={styles.hudBtns}>
                {!list ? (
                  <button type="button" className={styles.hudBtn} aria-pressed={compare} aria-label={m.hud.compareLabel} onClick={() => setCompare((c) => !c)}>
                    <Icon src={uiIcons.compare} size={18} />
                    <span className={styles.hudLabel}>{m.hud.compare}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.hudBtn}
                  aria-pressed={list}
                  aria-label={list ? m.hud.mapLabel : m.hud.listLabel}
                  onClick={() => {
                    setList((v) => {
                      writeListPref(!v);
                      return !v;
                    });
                  }}
                >
                  <Icon src={list ? uiIcons.map : uiIcons.list} size={18} />
                  <span className={styles.hudLabel}>{list ? m.hud.mapView : m.hud.list}</span>
                </button>
              </div>
            </div>
            {list ? (
              <MapListView view={view} onZone={openZone} onOutpost={openPin} />
            ) : (
              <CityMapSvg
                seed={seed}
                ring={view.ring}
                wallR={view.wallR}
                prevWallR={opening.wallR}
                prevRing={opening.ring}
                compareWallR={compare ? view.compare.wallR : null}
                pins={pins}
                residue={view.residue}
                bands={bands}
                selectedPin={selectedPin}
                selectedZone={selectedZone}
                reducedMotion={reduced}
                onZone={openZone}
                onPin={openPin}
              />
            )}
            {!list ? (
              <p className={cx(styles.since, compare && styles.legend)} role="status">
                {compare ? (
                  <>
                    <i className={styles.legendGhost} aria-hidden="true" /> {m.since.legend} <i className={styles.legendNew} aria-hidden="true" /> {m.since.legendNew}
                    {'. '}
                    {sinceLine}
                  </>
                ) : (
                  sinceLine
                )}
              </p>
            ) : null}
          </section>

          <SystemWindow
            title={
              <span className={styles.winTitle}>
                {m.domain.title} <small className={styles.winSub}>{m.domain.ringNo.replace('{ring}', String(view.ring))}</small>
              </span>
            }
          >
            <p className={styles.ringName}>{view.ringName}</p>
            <Meter value={view.pct} max={100} label={`${strings.ui.domainPoints} to the next ring`} tone="dp" hideText />
            <p className={cx('muted', styles.domainSub)}>
              {view.next ? (
                <>
                  <b className="mono">
                    {fmtNum(view.dp)} / {fmtNum(view.next.threshold)}
                  </b>{' '}
                  {m.domain.sub.replace('{dp} / {next} DP', 'DP').replace('{name}', view.next.name).replace('{pct}', String(view.pct))}
                </>
              ) : (
                m.domain.subCity.replace('{dp}', fmtNum(view.dp))
              )}
            </p>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statKey}>{m.domain.wallsHeld}</span>
                <span className={cx('mono', styles.statValue)}>
                  <Icon src={uiIcons.waveShield} size={14} className={styles.statIcon} /> {view.wallsHeld}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statKey}>{m.domain.wallBonus}</span>
                <span className={cx('mono', styles.statValue)}>+{view.wallBonus}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statKey}>{m.domain.outposts}</span>
                <span className={cx('mono', styles.statValue)}>
                  {view.outposts.length}
                  <span className={cx('muted', styles.statCap)}>/{view.cap}</span>
                </span>
              </div>
            </div>
          </SystemWindow>
        </div>

        <div className={styles.colB}>
          <SystemWindow
            title={
              <span className={styles.winTitle}>
                {m.outposts.title} <small className={styles.winSub}>{m.outposts.subtitle}</small>
              </span>
            }
          >
            {view.outposts.length === 0 ? <p className="muted">{m.outposts.empty}</p> : null}
            <ul className={styles.opList}>
              {view.outposts.map((o) => (
                <OutpostRow key={o.outpost.id} view={o} onOpen={openPin} onVisit={visitOutpost} />
              ))}
            </ul>
            <button type="button" className={cx('btn', 'btn--block', styles.markBtn)} disabled={view.free <= 0} onClick={() => setSheet({ kind: 'new' })}>
              <span aria-hidden="true">+</span> {m.outposts.mark}
            </button>
            <p className={cx('muted', styles.capLine)}>
              {view.free > 0 ? m.outposts.capRoom.replace('{free}', String(view.free)).replace('{ring}', view.ringName) : m.outposts.capFull.replace('{cap}', String(view.cap)).replace('{ring}', view.ringName)}
            </p>
          </SystemWindow>
        </div>
      </div>

      <ZoneSheet view={view} zone={selectedZone ? (view.zones[selectedZone - 1] ?? null) : null} onClose={close} onOpenOutpost={openPin} />
      <OutpostSheet
        view={sheet?.kind === 'pin' ? byId(sheet.id) : null}
        onClose={close}
        onVisit={visitOutpost}
        onUndoVisit={undoOutpostVisit}
        onEdit={(id) => setSheet({ kind: 'edit', id })}
        onRetire={(id) => {
          if (retireOutpost(id)) close();
        }}
      />
      <OutpostForm save={save} open={sheet?.kind === 'new' || sheet?.kind === 'edit'} editing={sheet?.kind === 'edit' ? (byId(sheet.id)?.outpost ?? null) : null} onClose={close} onSubmit={onFormSubmit} />
    </>
  );
}

interface OutpostRowProps {
  view: OutpostView;
  onOpen: (id: string) => void;
  onVisit: (id: string) => void;
}

/** One row of the Outposts window: state badge, visit meter and the one-tap check-in. */
function OutpostRow({ view, onOpen, onVisit }: OutpostRowProps) {
  const o = view.outpost;
  const meta = view.next ? m.outposts.visitsOf.replace('{visits}', String(o.visits)).replace('{next}', String(view.next.minVisits)) : m.outposts.visitsAll.replace('{visits}', String(o.visits));
  const label = `${o.name}, ${view.stateLabel}, ${meta}${view.quiet ? `, ${m.outposts.quiet.toLowerCase()}` : view.beyond ? `, ${m.outposts.beyondTheWall.toLowerCase()}` : ''}`;
  return (
    <li className={cx(styles.op, view.quiet && styles.opQuiet)} data-state={view.state}>
      <button type="button" className={styles.rowMain} aria-label={label} onClick={() => onOpen(o.id)}>
        <span className={styles.opIcon} aria-hidden="true">
          <Icon src={outpostIcons[o.type]} size={24} />
        </span>
        <span className={styles.opName}>
          <span className={styles.opNameText}>{o.name}</span>
          {view.quiet ? <span className={cx(styles.badge, styles.badgeQuiet)}>{m.outposts.quiet}</span> : view.beyond ? <span className={cx(styles.badge, styles.badgeBeyond)}>{m.outposts.beyond}</span> : null}
        </span>
        <span className={styles.opMeta}>
          <span className={cx(styles.badge, styles[`badge-${view.state}`])}>{view.stateLabel}</span>
          <span className={styles.miniMeter} aria-hidden="true">
            <i style={{ width: `${view.progressPct}%` }} />
          </span>
          <span className={styles.opMetaText}>{meta}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.checkBtn}
        disabled={view.loggedToday}
        aria-label={view.loggedToday ? m.outposts.loggedLabel.replace('{name}', o.name) : m.outposts.visitLabel.replace('{name}', o.name)}
        onClick={() => onVisit(o.id)}
      >
        <Icon src={uiIcons.check} size={18} />
        <span className={styles.checkLabel}>{view.loggedToday ? m.outposts.logged : m.outposts.visit}</span>
      </button>
    </li>
  );
}
