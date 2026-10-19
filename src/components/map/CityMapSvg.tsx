import { memo, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { OutpostState } from '../../game';
import { strings } from '../../game';
import gymRaw from '../../assets/outposts/gym.svg?raw';
import parkRaw from '../../assets/outposts/park.svg?raw';
import libraryRaw from '../../assets/outposts/library.svg?raw';
import friendRaw from '../../assets/outposts/friend.svg?raw';
import familyRaw from '../../assets/outposts/family.svg?raw';
import cafeRaw from '../../assets/outposts/cafe.svg?raw';
import clinicRaw from '../../assets/outposts/clinic.svg?raw';
import marketRaw from '../../assets/outposts/market.svg?raw';
import poolRaw from '../../assets/outposts/pool.svg?raw';
import classRaw from '../../assets/outposts/class.svg?raw';
import otherRaw from '../../assets/outposts/other.svg?raw';
import { cx } from '../../utils/cx';
import {
  CX,
  CY,
  VIEW_H,
  VIEW_W,
  buildLayout,
  corridorMarkup,
  corridorShapes,
  ellipsePath,
  ellipseRadii,
  f1,
  pinBaseMarkup,
  project,
  residueMarkup,
  tileState,
  type PinLike,
  type ResidueLike,
  type Tile,
  type TileState,
} from './layout';
import styles from './CityMap.module.css';

/* ------------------------------ Icons as symbols ------------------------------ */

const RAW_ICONS: Record<string, string> = {
  gym: gymRaw,
  park: parkRaw,
  library: libraryRaw,
  friend: friendRaw,
  family: familyRaw,
  cafe: cafeRaw,
  clinic: clinicRaw,
  market: marketRaw,
  pool: poolRaw,
  class: classRaw,
  other: otherRaw,
};

function toSymbol(id: string, raw: string): string {
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>/.exec(raw);
  if (!m) return '';
  // Stroke and fill live on `.picon` so every symbol does not repeat them.
  const attrs = (m[1] ?? '')
    .replace(/\s*xmlns="[^"]*"/, '')
    .replace(/\s*fill="none"/, '')
    .replace(/\s*stroke="currentColor"/, '')
    .replace(/\s*stroke-width="2\.5"/, '')
    .replace(/\s*stroke-linejoin="miter"/, '')
    .replace(/\s*stroke-linecap="square"/, '');
  const body = (m[2] ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();
  return `<symbol id="op-${id}"${attrs}>${body}</symbol>`;
}

const ICON_SYMBOLS = Object.entries(RAW_ICONS)
  .map(([id, raw]) => toSymbol(id, raw))
  .join('');

/* ------------------------------ Props ------------------------------ */

export interface PinView extends PinLike {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  stateLabel: string;
  quiet: boolean;
  zone: number;
  beyond: boolean;
  visits: number;
}

export interface ZoneBand {
  id: number;
  /** Spoken label: "Zone 6, The District, next ring, 200 DP to go". */
  label: string;
}

export interface CityMapSvgProps {
  seed: number;
  ring: number;
  wallR: number;
  /** The wall and ring as they stood at the last look; the map animates from here on mount. */
  prevWallR: number;
  prevRing: number;
  /** The 7-days ghost wall, when the compare toggle is on. */
  compareWallR: number | null;
  pins: PinView[];
  residue: ResidueLike[];
  bands: ZoneBand[];
  selectedPin: string | null;
  selectedZone: number | null;
  reducedMotion: boolean;
  onZone: (zone: number, opener: Element) => void;
  onPin: (id: string, opener: Element) => void;
}

/* ------------------------------ Tiles ------------------------------ */

interface TileGroupProps {
  className: string;
  style: CSSProperties | undefined;
  markup: string;
}

/** One memoised `<g>`: its markup never changes, only the class and the ripple delay. */
const TileGroup = memo(function TileGroup({ className, style, markup }: TileGroupProps) {
  return <g className={className} style={style} dangerouslySetInnerHTML={{ __html: markup }} />;
});

function groundClass(t: Tile, state: TileState, pop: boolean): string {
  return `g${t.home ? ' h' : ''}${t.kind !== 'lot' ? ` k-${t.kind}` : ''} s-${state}${pop ? ' pop' : ''}`;
}

function buildingClass(t: Tile, state: TileState, pop: boolean): string {
  const b = t.building;
  if (!b) return '';
  return `b f-${b.family}${b.variant ? ' vb' : ''} s-${state}${pop ? ' pop' : ''}`;
}

/** The tile `<g>` under an event target, as an index into its parent group. */
function childIndex(group: Element, target: Element | null): number {
  let el = target;
  while (el && el.parentNode !== group) el = el.parentElement;
  return el ? Array.prototype.indexOf.call(group.children, el) : -1;
}

const PIN_LIFT: Record<OutpostState, number> = { marked: 0, scouted: 0, corridor: 8, stronghold: 14 };

function activate(e: KeyboardEvent<SVGElement>): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  e.preventDefault();
  return true;
}

/**
 * The City Map: one inline SVG, 221 ground tiles, the seeded buildings, the
 * creeping wall with its ghost and residue, the corridors, the pins and the
 * seven focusable zone bands (docs/design/CITY-MAP.md 2, 5.3, 6).
 */
export function CityMapSvg({ seed, ring, wallR, prevWallR, prevRing, compareWallR, pins, residue, bands, selectedPin, selectedZone, reducedMotion, onZone, onPin }: CityMapSvgProps) {
  const layout = useMemo(() => buildLayout(seed), [seed]);
  const shapes = useMemo(() => corridorShapes(pins, wallR), [pins, wallR]);
  // The ripple plays once, from where the wall stood at the last look.
  const [from] = useState(() => ({ ring: Math.min(prevRing, ring), wallR: Math.min(prevWallR, wallR) }));
  const [shownWall, setShownWall] = useState(reducedMotion ? wallR : from.wallR);
  useEffect(() => {
    if (shownWall === wallR) return;
    const id = window.setTimeout(() => setShownWall(wallR), 40);
    return () => window.clearTimeout(id);
  }, [wallR, shownWall]);

  const occupied = useMemo(() => new Set(pins.map((p) => `${p.cell.x},${p.cell.y}`)), [pins]);
  const states = useMemo(() => layout.tiles.map((t) => tileState(t, ring, wallR, shapes)), [layout, ring, wallR, shapes]);
  const pops = useMemo(() => {
    if (reducedMotion) return null;
    const f = from;
    if (f.ring === ring && f.wallR >= wallR) return null;
    return layout.tiles.map((t, i) => {
      const litNow = states[i] !== 'f';
      const litBefore = t.z <= f.ring || t.d <= f.wallR;
      return litNow && !litBefore ? Math.max(0, Math.round((t.d - f.wallR) * 140)) : -1;
    });
  }, [layout, states, ring, wallR, reducedMotion, from]);

  const wall = ellipseRadii(shownWall);
  const glow = ellipseRadii(Math.max(2.2, shownWall * 1.05));
  const ghost = compareWallR === null ? null : ellipseRadii(compareWallR);
  const gained = compareWallR !== null && wallR > compareWallR + 0.02 ? ellipsePath(wallR) + ellipsePath(compareWallR) : '';
  const nextZoneEdge = ring < 7 ? ellipsePath([0.62, 1.62, 2.62, 3.82, 5.02, 6.52, 8.25][ring]!) : '';
  const marks = useMemo(() => residueMarkup(residue), [residue]);
  const corridors = useMemo(() => corridorMarkup(pins, wallR, shapes), [pins, wallR, shapes]);
  const sparkHtml = useMemo(
    () => layout.sparks.map((s) => s.markup.replace('<rect ', `<rect class="${states[s.tile] === 'f' ? 'spark' : 'spark off'}" `)).join(''),
    [layout, states],
  );
  const wallStyle = { rx: `${wall.rx}px`, ry: `${wall.ry}px` } as CSSProperties;
  const glowStyle = { rx: `${glow.rx}px`, ry: `${glow.ry}px` } as CSSProperties;

  const onGround = (e: MouseEvent<SVGGElement>) => {
    const i = childIndex(e.currentTarget, e.target as Element);
    const t = layout.tiles[i];
    if (t) onZone(t.z, e.currentTarget.children[i] as Element);
  };
  const onBuildings = (e: MouseEvent<SVGGElement>) => {
    const i = childIndex(e.currentTarget, e.target as Element);
    const t = layout.buildingTiles[i];
    if (t) onZone(t.z, e.currentTarget.children[i] as Element);
  };

  const orderedPins = useMemo(() => [...pins].sort((a, b) => a.cell.x + a.cell.y - (b.cell.x + b.cell.y) || a.zone - b.zone || a.name.localeCompare(b.name)), [pins]);

  return (
    <svg
      id="city-map"
      className={cx(styles.svg, ring === 7 && 'obs', compareWallR !== null && 'cmp')}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="group"
      aria-label={strings.map.a11y.svg}
    >
      <defs dangerouslySetInnerHTML={{ __html: layout.defs + ICON_SYMBOLS }} />
      <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: layout.sky }} />
      <g aria-hidden="true" onClick={onGround}>
        {layout.tiles.map((t, i) => {
          const dl = pops ? pops[i]! : -1;
          return <TileGroup key={t.index} className={groundClass(t, states[i]!, dl >= 0)} style={dl >= 0 ? ({ '--dl': `${dl}ms` } as CSSProperties) : undefined} markup={t.groundMarkup} />;
        })}
      </g>
      <g aria-hidden="true">
        <ellipse cx={CX} cy={CY} rx={glow.rx} ry={glow.ry} fill="url(#cm-glow)" className="glow" style={glowStyle} />
        <ellipse className="wallfill" cx={CX} cy={CY} rx={wall.rx} ry={wall.ry} style={wallStyle} />
      </g>
      <g aria-hidden="true" onClick={onBuildings}>
        {layout.buildingTiles.map((t) => {
          const dl = pops ? pops[t.index]! : -1;
          const hidden = occupied.has(`${t.cell.x},${t.cell.y}`) && t.kind !== 'haven';
          const style: CSSProperties | undefined = hidden ? { display: 'none' } : dl >= 0 ? ({ '--dl': `${dl}ms` } as CSSProperties) : undefined;
          return <TileGroup key={t.index} className={buildingClass(t, states[t.index]!, dl >= 0)} style={style} markup={t.building!.markup} />;
        })}
      </g>
      <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: sparkHtml }} />
      <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: marks.scorch }} />
      <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: layout.guides }} />
      <g aria-hidden="true">
        <path className="gained" fillRule="evenodd" d={gained} />
        {ghost ? <ellipse className="ghost" cx={CX} cy={CY} rx={ghost.rx} ry={ghost.ry} /> : null}
        <path className="nextring" d={nextZoneEdge} />
        <ellipse className="wallglow" cx={CX} cy={CY} rx={wall.rx} ry={wall.ry} style={wallStyle} />
        <ellipse className="wall" cx={CX} cy={CY} rx={wall.rx} ry={wall.ry} style={wallStyle} />
      </g>
      <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: corridors }} />
      <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: marks.flags }} />
      <g>
        {bands.map((b, i) => (
          <path
            key={b.id}
            className={cx('band', selectedZone === b.id && 'sel')}
            fillRule="evenodd"
            tabIndex={0}
            role="button"
            aria-label={b.label}
            d={layout.bands[i] ?? ''}
            onKeyDown={(e) => {
              if (activate(e)) onZone(b.id, e.currentTarget);
            }}
            onClick={(e) => onZone(b.id, e.currentTarget)}
          />
        ))}
      </g>
      <g>
        {orderedPins.map((p) => {
          const c = project(p.cell.x, p.cell.y);
          const lift = PIN_LIFT[p.state];
          const base = pinBaseMarkup(p.cell, p.state);
          return (
            <g key={p.id}>
              {base ? <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: base }} /> : null}
              <g
                className={cx('pin', `st-${p.state}`, p.quiet && 'quiet', selectedPin === p.id && 'sel')}
                tabIndex={0}
                role="button"
                aria-label={pinLabel(p)}
                transform={`translate(${f1(c[0])} ${f1(c[1] - lift)})`}
                onClick={(e) => onPin(p.id, e.currentTarget)}
                onKeyDown={(e) => {
                  if (activate(e)) onPin(p.id, e.currentTarget);
                }}
              >
                <use href={lift === 14 ? '#p14' : lift === 8 ? '#p8' : '#p0'} />
                <circle className="halo" cy="-22" r="12" />
                <use href={`#op-${p.type}`} x="-5.5" y="-27.5" width="11" height="11" className="picon" />
                {p.state === 'stronghold' ? <path className="crown" d="M-5 -30v-4.5l2.5 2 2.5-3 2.5 3 2.5-2v4.5z" /> : null}
                {p.quiet ? <path className="zz" d="M9 -33h3.5l-3.5 3.5h3.5M13.5 -38h2.5l-2.5 2.5h2.5" /> : null}
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function pinLabel(p: PinView): string {
  return strings.map.a11y.pin
    .replace('{name}', p.name)
    .replace('{type}', p.typeLabel)
    .replace('{state}', p.stateLabel)
    .replace('{quiet}', p.quiet ? ', quiet' : '')
    .replace('{zone}', String(p.zone))
    .replace('{beyond}', p.beyond ? ', beyond the wall' : '')
    .replace('{visits}', String(p.visits));
}

