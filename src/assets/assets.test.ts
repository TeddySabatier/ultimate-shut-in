import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ASSETS_DIR = join(__dirname);

function walkSvgs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkSvgs(full));
    else if (entry.endsWith('.svg')) out.push(full);
  }
  return out.sort();
}

const files = walkSvgs(ASSETS_DIR);

/** Every file the index must expose, relative to src/assets. */
const EXPECTED = [
  ...['move', 'outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene'].flatMap((h) => [`habits/${h}.svg`, `vassals/${h}.svg`]),
  'vassals/silhouette.svg',
  ...['room', 'flat', 'floor', 'building', 'block', 'district', 'city', 'absolute'].map((r) => `haven/${r}.svg`),
  ...[
    'clutter-blob', 'procrastination-moth', 'doomscroll-wyrm', 'dust-bunny', 'snooze-golem',
    'couch-leech', 'fog-wraith', 'junk-food-imp', 'silence-specter', 'the-static', 'boss-static',
  ].map((m) => `monsters/${m}.svg`),
  ...[
    'panel-frame', 'xp-bar-cap', 'coin', 'domain-point', 'utility-power', 'utility-water', 'utility-gas',
    'title-badge', 'combo-weapon', 'resurrection-token', 'wave-shield', 'check', 'timer', 'lock',
    'chevron', 'close', 'settings', 'home', 'quests', 'character', 'mic', 'map', 'compare', 'list',
  ].map((u) => `ui/${u}.svg`),
  ...['gym', 'park', 'library', 'friend', 'family', 'cafe', 'clinic', 'market', 'pool', 'class', 'other'].map((o) => `outposts/${o}.svg`),
  'logo/logo.svg',
  'logo/mark.svg',
];

describe('svg assets', () => {
  it('finds every expected asset file', () => {
    const rel = new Set(files.map((f) => relative(ASSETS_DIR, f).replace(/\\/g, '/')));
    for (const name of EXPECTED) expect(rel, `missing ${name}`).toContain(name);
  });

  it.each(files.map((f) => [relative(ASSETS_DIR, f).replace(/\\/g, '/'), f]))('%s is a well-formed, self-contained svg', (_name, file) => {
    const src = readFileSync(file, 'utf8');
    const rootMatch = /<svg\b[^>]*>/.exec(src);
    expect(rootMatch, 'has an <svg> root').not.toBeNull();
    const root = rootMatch![0];

    expect(root).toMatch(/\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(root).toMatch(/\bviewBox="0 0 \d+ \d+"/);
    expect(root).not.toMatch(/\swidth=/);
    expect(root).not.toMatch(/\sheight=/);

    expect(src).not.toMatch(/<script/i);
    expect(src).not.toMatch(/\bon[a-z]+=/i); // no event handlers
    expect(src).not.toMatch(/<text\b/i); // no baked-in text
    expect(src).not.toMatch(/<image\b/i); // no embedded rasters
    expect(src).not.toMatch(/href="(?!#)/); // no external references
    expect(src).not.toMatch(/@import|url\((?!#)/); // no external css / urls (only local #id refs)

    // every url(#id) reference resolves to an id defined in the same file
    const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of src.matchAll(/url\(#([^)]+)\)/g)) expect(ids, `url(#${m[1]}) defined`).toContain(m[1]);

    // balanced root
    expect((src.match(/<svg\b/g) ?? []).length).toBe(1);
    expect(src.trimEnd().endsWith('</svg>')).toBe(true);

    // gradients: at most two stops (style rule from ART.md)
    for (const g of src.matchAll(/<(linear|radial)Gradient[\s\S]*?<\/\1Gradient>/g)) {
      expect((g[0].match(/<stop\b/g) ?? []).length, 'gradient has <= 2 stops').toBeLessThanOrEqual(2);
    }
  });

  it('monochrome icon sets use currentColor only', () => {
    const mono = files.filter((f) => /[\\/](habits|outposts)[\\/]/.test(f) || /[\\/]ui[\\/](check|timer|lock|chevron|close|settings|home|quests|character|mic|map|compare|list|utility-\w+|wave-shield|title-badge|panel-frame|xp-bar-cap)\.svg$/.test(f));
    expect(mono.length).toBeGreaterThan(0);
    for (const f of mono) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} should not hard-code colours`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(src).toMatch(/currentColor/);
    }
  });

  it('has an icon for every outpost type in the content', async () => {
    const { outpostTypes } = await import('../game/content');
    const { outpostIcons } = await import('./index');
    for (const t of outpostTypes) expect(typeof (outpostIcons as Record<string, string | undefined>)[t.icon], `icon ${t.icon}`).toBe('string');
  });

  it('keeps every asset small', () => {
    for (const f of files) expect(statSync(f).size, `${f} under 32 KB`).toBeLessThan(32 * 1024);
  });
});
