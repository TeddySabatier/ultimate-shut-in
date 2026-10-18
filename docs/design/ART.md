# Haven Protocol — Art Guide

Every visual asset in the game is a hand-authored (or script-generated) SVG under `src/assets/`. The look is a dark retro-RPG "system window": flat vector, chunky pixel-adjacent geometry, thin dark outlines, a soft violet glow where the Haven is. Nothing is rasterised except the PWA icons, which are rendered from the SVG mark.

## 1. Style guide

### Palette

Taken from `src/styles/tokens.css`. Use these literally in full-colour art; monochrome icons use `currentColor` so the UI tints them.

| Token | Hex | Used for |
| --- | --- | --- |
| bg | `#0f0f14` | page background, **outlines on all colour art** |
| panel | `#1a1a24` | portrait frames, dark fills |
| panel-raised | `#22222f` | secondary surfaces |
| border | `#2c2c3c` | frame strokes, dim building bodies |
| accent (violet) | `#7c5cff` | the Haven, anything the player owns, logo |
| accent light | `#a08cff` | violet highlights (lit windows, second logo line) |
| accent dark | `#4a36a8` / `#3a2a80` | violet shadow / logo drop-shadow |
| accent-2 (amber) | `#ffb84d` | currency, sun, domain boundary ring, logo accent |
| amber dark | `#b8741f` | amber shadow |
| danger | `#ff4d6d` | monster eyes, blush, alerts |
| success | `#4dff9a` | clean sparkle, success states |
| text | `#e8e8f0` | highlights, teeth, stars |
| muted | `#8a8a9e` | dust, metal, dim details |

Extra colours allowed only in portraits/monsters for skin, hair and props: skin `#f5d6b8 #f1c9a5 #e8b89a #d9a070 #c48a5a #b07a4e #8a5a3a #6a3e22`, hair `#1c1c24 #1c2a44 #4a2e1a #5a3a22 #c0c0cc #ff7bb0`, props as needed but always outlined in bg.

### Geometry and strokes

- **Outlines**: `#0f0f14`, 2px on 64–128px art, 1.5px on fine detail, `stroke-linejoin="miter"`. Monochrome icons: `currentColor`, 2–3px, `stroke-linecap="square"`.
- **Shapes**: chunky, flat, 45° chamfers instead of tight curves where it reads; short arcs are fine for faces and blobs.
- **Glow**: one radial gradient max per file, 2 stops, violet → transparent. No gradient may have more than 2 stops (enforced by the test).
- **No** `<text>`, `<image>`, `<script>`, event handlers, external `href`s, or `width`/`height` on the root. Every file has `xmlns` and a `viewBox` (enforced by `src/assets/assets.test.ts`).
- Internal ids (`clipPath`, gradients) are prefixed per file (`v-move-clip`, `hv-room-glow`) so files can also be inlined without collisions.

### Sizes (viewBox)

| Set | viewBox | Colour |
| --- | --- | --- |
| habits | 48×48 | monochrome `currentColor` |
| ui nav / status icons | 24×24 | monochrome `currentColor` |
| ui coin, domain-point | 24×24 | full colour |
| ui title-badge, combo-weapon, resurrection-token | 32×32 | badge mono, others colour |
| ui panel-frame | 96×96 | monochrome, 9-slice at 16/80 |
| ui xp-bar-cap | 12×24 | monochrome (mirror with `scaleX(-1)`) |
| vassals, absolute | 128×128 | full colour, rounded panel frame built in |
| monsters | 64×64 (boss 96×96) | full colour |
| haven scenes | 360×200 | full colour, opaque bg |
| logo | 320×120 / mark 64×64 | violet + amber |

Tinting a monochrome icon: `<img src={uiIcons.check} style="color: var(--color-success)">` does **not** work for `<img>`; use the SVG inline or as a CSS `mask-image` with a `background-color`, or set `color` on an inline `<svg>` wrapper. Everything exported from `src/assets/index.ts` is a URL.

## 2. Inventory

### `habits/` — 8 files, 48×48, mono
| File | Shows | Use |
| --- | --- | --- |
| `move.svg` | dumbbell | Move habit card, vassal badge |
| `outside.svg` | open door + sun | Outside habit |
| `clean.svg` | tilted broom + sparkle | Clean habit |
| `social.svg` | two chat bubbles | Social habit |
| `study.svg` | open book | Study habit |
| `sleep.svg` | crescent + zzz | Sleep habit |
| `eat.svg` | bowl, chopsticks, steam | Eat habit |
| `hygiene.svg` | drop + toothbrush | Hygiene habit |

### `vassals/` — 9 files, 128×128, colour
| File | Character | Theme colour |
| --- | --- | --- |
| `move.svg` | young athlete, high ponytail, red headband, towel | `#ff4d6d` |
| `outside.svg` | older man, straw hat, grey beard, sun glow | `#ffb84d` |
| `clean.svg` | woman, polka bandana, yellow rubber glove raised | `#4dff9a` |
| `social.svg` | young man, pink curls, phone up, chat bubble | `#ff7bb0` |
| `study.svg` | teen, bob cut, round amber glasses, open book | `#4da3ff` |
| `sleep.svg` | elderly woman, violet nightcap, half-closed eyes | `#7c5cff` |
| `eat.svg` | big man, moustache, apron, ladle | `#e2a44a` |
| `hygiene.svg` | woman, towel turban, steam, bathrobe | `#5ad1e6` |
| `silhouette.svg` | dashed empty bust with a question mark | vassal who has left |

Each portrait is a chest-up bust in its own rounded panel with theme-coloured corner notches and a faint diagonal band, so it can sit directly in a card without extra chrome.

### `haven/` — 8 files
| File | Ring | Scene |
| --- | --- | --- |
| `room.svg` | 0 | isometric cutaway of one room: desk with glowing monitor, bed, window with moon |
| `flat.svg` | 1 | four-room flat cutaway, the Haven bedroom lit violet |
| `floor.svg` | 2 | one-point-perspective corridor, doors both sides, the Haven door glowing at the end |
| `building.svg` | 3 | front view of the building, one window glowing, neighbours dim |
| `block.svg` | 4 | isometric city block with street cross, the Haven building lit |
| `district.svg` | 5 | isometric district grid with park and river, Haven spire at the centre |
| `city.svg` | 6 | layered skyline, moon, Haven tower cluster glowing |
| `absolute.svg` | — | the protagonist: hoodie, headphones around the neck, desk by a window |

All seven ring scenes share: opaque `#0f0f14` sky with stars, violet radial glow on the Haven, and a dashed amber ellipse for the domain boundary. They are built to crop from the centre, so `background-size: cover; background-position: center` is safe.

### `monsters/` — 11 files, 64×64 (boss 96×96)
`clutter-blob`, `procrastination-moth`, `doomscroll-wyrm`, `dust-bunny`, `snooze-golem`, `couch-leech`, `fog-wraith`, `junk-food-imp`, `silence-specter`, `the-static` (TV-head giant), `boss-static` (96×96 boss card version with glow, dials and cable fingers). Used in the weekly wave log and the boss panel.

### `ui/` — 20 files
| File | Size | Notes |
| --- | --- | --- |
| `panel-frame.svg` | 96 | 9-slice frame with corner notches; slice guides at 16/80 |
| `xp-bar-cap.svg` | 12×24 | left cap of the XP bar; mirror for the right |
| `coin.svg` | 24 | amber coin with an H notch (currency) |
| `domain-point.svg` | 24 | violet hex gem (domain points) |
| `utility-power.svg` / `utility-water.svg` / `utility-gas.svg` | 24 | bolt / drop / flame, mono |
| `title-badge.svg` | 32 | shield outline, mono |
| `combo-weapon.svg` | 32 | mop-spear (handle + duct tape + kitchen knife) |
| `resurrection-token.svg` | 32 | phoenix feather |
| `wave-shield.svg` | 24 | shield with wave crest, mono |
| `check`, `timer`, `lock`, `chevron`, `close`, `settings`, `home`, `quests`, `character` | 24 | mono nav / status icons; `chevron` points right, rotate in CSS |

### `logo/` — 2 files
- `logo.svg` 320×120 — "HAVEN PROTOCOL" in a 5×7 bitmap face converted to paths (no fonts). Violet, the V in amber, dark drop-shadow, amber corner brackets. **Generated** by `scripts/gen-logo.mjs`; edit the script.
- `mark.svg` 64×64 — glowing amber door inside a violet hex ring. Source for `public/favicon.svg` (identical copy) and the PNG icons.

### PWA icons
`public/icons/icon-{192,512}.png` and `icon-maskable-{192,512}.png` are produced by `npm run icons` (`scripts/gen-icons.mjs`) from `mark.svg` with `sharp`. Maskable variants draw the mark at 60% on solid `#0f0f14`. If `sharp` is unavailable the script falls back to drawing the same mark procedurally with `pngjs` (`ICONS_NO_SHARP=1` forces that path).

## 3. Adding a new asset

1. Pick the set and its viewBox from the size table. Start from a sibling file in the same folder: copy its root tag and frame.
2. Draw with the palette above; outline colour art in `#0f0f14`; monochrome icons use `fill="none" stroke="currentColor"` (or `fill="currentColor"`) and no hex colours at all.
3. Prefix any `id` with a short file-unique tag (`v-`, `hv-`, `mk-` …). Keep gradients to 2 stops.
4. Register it in `src/assets/index.ts` (import + add to the right typed map; extend the `*_IDS` tuple for habits/monsters so `HabitId`/`MonsterId` stay exhaustive) and add the file name to `EXPECTED` in `src/assets/assets.test.ts`.
5. Run `npm test` (structure checks) and `npm run build`.
6. To eyeball it, rasterise with sharp from the repo root, e.g.
   `node -e "require('sharp')('src/assets/monsters/new.svg',{density:300}).resize(256).png().toFile('out.png')"`.

For a new **vassal portrait**, keep the shared bust proportions (head 48×56 at 40,30; neck 54–74; shoulders from y≈94) so the row of portraits lines up. For a new **haven ring**, reuse the isometric helper in the generator (`p(x, y, z) → [cx + (x − y)·s, cy + (x + y)·s/2 − z·s]`): back walls are the `y = 0` (upper-right) and `x = 0` (upper-left) planes; the visible faces of a box are its `y + d` and `x + w` sides plus the top.
