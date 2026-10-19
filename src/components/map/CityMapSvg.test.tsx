import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CityMapSvg, type PinView, type ZoneBand } from './CityMapSvg';
import { buildLayout, corridorShapes, inShapes, residueMarkup, tileState } from './layout';

const BANDS: ZoneBand[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, label: `Zone ${id}` }));

function pin(id: string, x: number, y: number, state: PinView['state'], extra: Partial<PinView> = {}): PinView {
  return { id, name: `Place ${id}`, type: 'gym', typeLabel: 'Gym', cell: { x, y }, state, stateLabel: state, quiet: false, zone: 4, beyond: false, visits: 0, ...extra };
}

/** Ring 7, ten outposts across the states, two waves of residue: the worst case of CITY-MAP 5.4. */
const WORST_PINS: PinView[] = [
  pin('op1', 2, 1, 'stronghold'),
  pin('op2', -2, 1, 'stronghold'),
  pin('op3', 1, -3, 'stronghold'),
  pin('op4', -3, -3, 'corridor'),
  pin('op5', 5, 3, 'corridor', { quiet: true }),
  pin('op6', 3, 3, 'scouted'),
  pin('op7', -6, 1, 'scouted'),
  pin('op8', 6, -3, 'marked', { quiet: true }),
  pin('op9', -5, -5, 'marked'),
  pin('op10', 1, 7, 'corridor'),
];
const RESIDUE = [
  { result: 'loss' as const, age: 3, wallR: 7.9, seed: 11 },
  { result: 'decisive' as const, age: 9, wallR: 7.5, seed: 23 },
];

describe('layout', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = buildLayout(7);
    const b = buildLayout(7);
    const c = buildLayout(8);
    expect(a).toBe(b); // memoised
    expect(a.tiles).toHaveLength(221);
    expect(a.tiles.map((t) => t.building?.family ?? '')).toEqual(b.tiles.map((t) => t.building?.family ?? ''));
    expect(a.tiles.map((t) => t.building?.markup ?? '').join('')).not.toBe(c.tiles.map((t) => t.building?.markup ?? '').join(''));
    // Landmarks are fixed by zone whatever the seed.
    const at = (l: typeof a, x: number, y: number) => l.tileAt.get(`${x},${y}`)!;
    expect(at(a, 0, 0).building?.family).toBe('haven');
    expect(at(c, 5, -2).building?.family).toBe('civic');
    expect(at(c, 2, -5).building?.family).toBe('civic');
    expect(at(c, -6, 1).building?.family).toBe('tree');
    expect(at(c, 4, 1).building).toBeNull();
    expect(a.bands).toHaveLength(7);
    expect(a.sparks.length).toBeGreaterThan(20);
  });

  it('classifies tiles as claimed, dawn, corridor-lit or fog', () => {
    const l = buildLayout(1);
    const shapes = corridorShapes([pin('x', 5, 3, 'corridor'), pin('y', -5, -5, 'stronghold')], 2.0);
    expect(shapes.map((s) => s.type)).toEqual(['strip', 'strip', 'bubble']);
    const haven = l.tileAt.get('0,0')!;
    expect(tileState(haven, 1, 0.82, shapes)).toBe('c');
    const flat = l.tileAt.get('1,0')!;
    expect(tileState(flat, 1, 0.82, shapes)).toBe('f');
    expect(tileState(flat, 1, 1.2, shapes)).toBe('d');
    expect(tileState(flat, 2, 0.82, shapes)).toBe('c');
    expect(inShapes({ x: 4, y: 2 }, shapes)).toBe(true);
    expect(inShapes({ x: -5, y: -4 }, shapes)).toBe(true);
    expect(inShapes({ x: 0, y: 6 }, shapes)).toBe(false);
    expect(tileState(l.tileAt.get('4,2')!, 1, 0.82, shapes)).toBe('k');
  });

  it('draws 2, 3 or 4 scorch marks and a flag for 7 days', () => {
    const fresh = residueMarkup([{ result: 'win', age: 0, wallR: 3, seed: 5 }]);
    expect(fresh.scorch.match(/class="scorch"/g)).toHaveLength(3);
    expect(fresh.flags).toContain('held r-win');
    const old = residueMarkup([{ result: 'loss', age: 8, wallR: 3, seed: 5 }]);
    expect(old.scorch.match(/class="scorch"/g)).toHaveLength(4);
    expect(old.scorch).toContain('opacity="0.43"');
    expect(old.scorch).not.toContain('class="em"');
    expect(old.flags).toBe('');
    expect(residueMarkup([{ result: 'decisive', age: 14, wallR: 3, seed: 5 }]).scorch).toBe('');
  });
});

describe('CityMapSvg', () => {
  const base = {
    seed: 42,
    ring: 7 as const,
    wallR: 8.45,
    prevWallR: 8.45,
    prevRing: 7,
    compareWallR: 7.9,
    pins: WORST_PINS,
    residue: RESIDUE,
    bands: BANDS,
    selectedPin: null,
    selectedZone: null,
    reducedMotion: true,
    onZone: () => undefined,
    onPin: () => undefined,
  };

  it('serialises under 60 KB and 1,500 elements in the worst case', () => {
    const { container } = render(<CityMapSvg {...base} />);
    const svg = container.querySelector('svg')!;
    expect(svg.outerHTML.length).toBeLessThan(60_000);
    expect(svg.querySelectorAll('*').length).toBeLessThan(1500);
    expect(svg.querySelectorAll('[data-pin], [data-zone], [data-cell]')).toHaveLength(0);
    expect(svg.querySelectorAll('image, filter')).toHaveLength(0);
    expect(svg.querySelectorAll('radialGradient, linearGradient')).toHaveLength(1);
    expect(svg.querySelectorAll('pattern').length).toBeLessThanOrEqual(16);
  });

  it('exposes seven zone bands and the pins as buttons, in that order', () => {
    render(<CityMapSvg {...base} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7 + WORST_PINS.length);
    expect(buttons.slice(0, 7).map((b) => b.getAttribute('aria-label'))).toEqual(BANDS.map((b) => b.label));
    expect(screen.getByRole('button', { name: /Place op5, Gym, corridor, quiet, zone 4, 0 visits/ })).toBeInTheDocument();
    for (const b of buttons) expect(b).toHaveAttribute('tabindex', '0');
  });

  it('opens a zone from a band by keyboard and from a building by tap, and a pin by both', () => {
    const onZone = vi.fn();
    const onPin = vi.fn();
    const { container } = render(<CityMapSvg {...base} onZone={onZone} onPin={onPin} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Zone 6' }), { key: 'Enter' });
    expect(onZone).toHaveBeenLastCalledWith(6, expect.anything());
    fireEvent.keyDown(screen.getByRole('button', { name: /Place op1, Gym/ }), { key: ' ' });
    expect(onPin).toHaveBeenLastCalledWith('op1', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Place op7, Gym/ }));
    expect(onPin).toHaveBeenLastCalledWith('op7', expect.anything());
    // The Haven tower is the first building: tapping its top opens zone 1 (hit-test by cell, not screen position).
    const layout = buildLayout(42);
    const groups = container.querySelectorAll('svg > g');
    const blds = groups[3]!;
    const havenIndex = layout.buildingTiles.findIndex((t) => t.kind === 'haven');
    fireEvent.click(blds.children[havenIndex]!.firstElementChild!);
    expect(onZone).toHaveBeenLastCalledWith(1, expect.anything());
    // A ground tile in The City.
    const ground = groups[1]!;
    const cityIndex = layout.tiles.findIndex((t) => t.z === 7);
    fireEvent.click(ground.children[cityIndex]!.firstElementChild!);
    expect(onZone).toHaveBeenLastCalledWith(7, expect.anything());
  });

  it('lights the claimed zones, draws the ghost wall when comparing and skips the ripple under reduced motion', () => {
    const { container, rerender } = render(<CityMapSvg {...base} ring={2} wallR={1.9} prevWallR={0.82} prevRing={1} compareWallR={null} pins={[]} residue={[]} />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('.pop')).toHaveLength(0);
    expect(svg.querySelector('.ghost')).toBeNull();
    expect(svg.querySelectorAll('.g.s-c').length).toBe(9); // zones 1 and 2
    const { container: dawnBox } = render(<CityMapSvg {...base} ring={1} wallR={1.2} prevWallR={0.82} prevRing={1} compareWallR={null} pins={[]} residue={[]} />);
    expect(dawnBox.querySelectorAll('.g.s-d').length).toBeGreaterThan(0); // dawn cells inside the creep
    rerender(<CityMapSvg {...base} ring={2} wallR={1.9} prevWallR={0.82} prevRing={1} compareWallR={0.82} pins={[]} residue={[]} />);
    expect(svg.querySelector('.ghost')).not.toBeNull();
    expect(svg.querySelector('.gained')?.getAttribute('d')?.length).toBeGreaterThan(10);
  });

  it('ripples the newly lit tiles from the previous wall when motion is allowed', () => {
    const { container } = render(<CityMapSvg {...base} ring={3} wallR={3.0} prevWallR={0.82} prevRing={1} compareWallR={null} pins={[]} residue={[]} reducedMotion={false} />);
    const svg = container.querySelector('svg')!;
    const popped = svg.querySelectorAll('.g.pop');
    expect(popped.length).toBeGreaterThan(10);
    expect((popped[popped.length - 1] as HTMLElement).style.getPropertyValue('--dl')).toMatch(/\d+ms/);
    expect(svg.querySelector('.wall')?.getAttribute('rx')).toBe(String(Math.round(0.82 * 14.5 * Math.SQRT2 * 10) / 10));
  });
});
