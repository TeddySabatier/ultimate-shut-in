# Parallel work: finish the City Map

Owner: the orchestrator. This is the execution plan for [`design/CITY-MAP.md`](design/CITY-MAP.md). It is the remaining in-scope product work after v0.1.0 (custom quests already shipped). Out of scope here: citizens, shop registration, familiars, notifications, sync.

**Starting point.** Branch `wip/map-tab` (`63c5d9a`) is merged into this work. The commit says the engine (save v4, outposts, wave term) is mostly in place and the SVG map, list view and e2e are not finished; the tree is **not green**. Do not re-implement what already exists. Finish it against the spec, make CI green, and ship.

**Source of truth.** CITY-MAP.md wins for rules and UX. [`RESPONSIVE-RULES.md`](RESPONSIVE-RULES.md) wins for layout. [`ARCHITECTURE.md`](ARCHITECTURE.md) and `src/game/README.md` win for the engine contract. Copy lives in `src/game/content/strings.json` under `map.*`. Tone: warm, never punitive. Everything original.

Each stream owns a disjoint file set so four cloud agents can run at once. Do not edit another stream's files. If you need a type or copy change in someone else's file, add a short `// STREAM-NEEDED: ...` comment in *your* file and keep going with a local workaround.

---

## Ground rules (every stream)

- `src/game/` stays pure: no React, DOM, storage, `Date.now()` or `Math.random()`. Mutators are `(save, now, ...) => { save, events, error? }`; never mutate the input.
- Only `src/state/gameStore.ts` calls engine mutators. Screens do not compute rewards, dates, wall radius or perks.
- Save format is version 4; any further schema change needs a migration and a test.
- Grids: `minmax(0, 1fr)`. Fixed-size flex children: `flex: none`. No fixed px heights on content. Overlays: `flex-start` + `margin-top: auto`, scroll inside. Safe-area insets once. Breakpoints: `max-width: 359px`, `min-width: 768px`, `max-height: 500px`. Tap targets 44px.
- Before you finish: `npm run lint && npm run typecheck && npm test && npm run build` on *your* files must pass. UI streams also run `npm run e2e` and look at `e2e/__screenshots__/`.
- Do not invent features that are not in CITY-MAP.md.

---

## Already on the branch (do not redo)

| Area | Where |
|---|---|
| Content | `src/game/content/outposts.json`, `strings.json` `map.*`, loader checks |
| Save v4 | `types.ts`, `save.ts` `SAVE_VERSION = 4`, `createNewSave`, `migrate` v3→v4 |
| Geometry | `src/game/mapGeometry.ts` + tests |
| Engine | `outposts.ts`, `map.ts`, board/economy/wave/tick/custom integrations |
| Store | `gameStore.ts` map actions, `mapView.ts`, `eventText.ts` |
| Assets | `src/assets/outposts/*.svg` (11), `ui/map.svg`, `list.svg`, `compare.svg` |
| SVG map | `src/components/map/{layout.ts,CityMapSvg.tsx,CityMap.module.css}` |
| Screen | `MapScreen`, list view, zone/outpost sheets, form, fifth tab, `/map` route |
| Wiring | RingHeader chip, RingUnlock *See it on the map*, settlement `WhereWereYou`, Ledger `OutpostsSection` |
| Custom default | engine auto-tags completions when `CustomTemplate.outpostId` is set |

---

## File ownership

| Stream | Owns (exclusive) | May read |
|---|---|---|
| **A Engine** | `src/game/**` (including `content/outposts.json`, `content/index.ts`, `schema.md`, `README.md`), `src/state/mapView.ts`, `src/state/mapStore.test.ts`, `src/state/gameStore.ts`, `src/state/gameStore.test.ts`, `src/state/selectors.ts`, `src/state/index.ts`, `docs/design/GDD-errata.md` | everything |
| **B Map SVG** | `src/components/map/**` | engine types, `mapView`, prototype HTML/PNGs, ART.md |
| **C Map UI** | `src/screens/MapScreen.tsx`, `src/screens/MapScreen.module.css`, `src/screens/MapScreen.test.tsx`, `src/screens/map/**`, `src/screens/CharacterScreen.tsx`, `src/screens/ComposeQuestSheet.tsx`, `src/screens/ComposeQuestSheet.test.tsx`, `src/screens/HomeScreen.tsx`, `src/components/OutpostsSection.tsx`, `src/components/OutpostsSection.module.css`, `src/components/TabBar.tsx`, `src/components/TabBar.module.css`, `src/components/RingHeader.tsx`, `src/components/RingHeader.module.css`, `src/components/AppShell.tsx`, `src/components/AppShell.module.css`, `src/components/overlays/WhereWereYou.tsx`, `src/components/overlays/RingUnlockWindow.tsx`, `src/components/overlays/OverlayHost.tsx`, `src/components/overlays/OverlayHost.test.tsx`, `src/components/overlays/Toast.tsx`, `src/components/overlays/overlays.module.css`, `src/App.tsx`, `src/assets/index.ts`, `src/assets/assets.test.ts`, `src/game/content/strings.json` (only `map.*`, `compose.*`, `ui.map` keys) | engine, `mapView`, `CityMapSvg` props |
| **D E2E + docs** | `e2e/**`, `docs/PLAYER-GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md` (only if needed), `README.md`, `CLAUDE.md` (docs map line only) | all screens |

`src/game/content/strings.json` is owned by **C** for player-facing map/compose keys. **A** may add engine error codes under `map.errors` if a mutator needs a new refusal; otherwise A uses the codes already there.

If A must change a store action signature, A updates `gameStore.ts` and C adapts call sites in a follow-up. Prefer keeping the existing action names: `createOutpost`, `editOutpost`, `moveOutpost`, `retireOutpost`, `restoreOutpost`, `forgetOutpost`, `visitOutpost`, `undoOutpostVisit`, `tagQuestAtOutpost`, `markMapSeen`.

---

## Stream A — Engine completeness

Make the pure engine match CITY-MAP.md sections 3–4 and turn the package green on engine + store tests.

### Done when

- Every function in CITY-MAP 4.3 exists, is exported from `src/game/index.ts`, and has tests:
  - create / suggest / edit / move / retire / restore / forget
  - log visit, tag quest, undo visit, untag on `undoQuest`
  - `markMapSeen`, `compareSnapshot`, snapshots on every settlement including quiet
  - perks: reroll 15→10 (and 10→5 with Corner Shop) for related habits only; corridor +10% settlement not stacked; stronghold defense +2 each, cap +6, own breakdown term and log line
- Refusals from CITY-MAP 3.6 / 4.3: empty or duplicate name, cap 4 at ring 1, fourth in a zone, zone 1, spacing < 3, off-island, already logged today, quest not done, already tagged, not retired (forget), nothing to undo. Warm copy already lives in `strings.map.errors`.
- Invariants 4.2: map never changes DP or ring (property test over random action sequences); `peak` never drops; at most one counted visit per outpost per game day; retired give nothing; snapshots strictly increasing `periodIndex`; inputs deep-equal after every mutator.
- 3 / 10 / 30 visits emit `outpostStateReached` once; climbing back after undo emits nothing.
- Quiet after 14 days (7 if never visited); a visit clears it; nothing else changes.
- `outpostWithinWalls` fires once, on the covering unlock.
- Custom template `outpostId` auto-tags on complete; undo removes the visit; `pacing.test.ts` still passes unchanged.
- v2 and v3 saves migrate to v4; damaged-map fixtures normalise; round-trip export/import.
- `src/game/README.md` module map includes `map.ts`, `mapGeometry.ts`, `outposts.ts`. `content/schema.md` documents `outposts.json`. GDD-errata notes the map (reroll discount, corridor coins, stronghold defense, save v4) where code departs from GDD 1.0.
- `npm run lint && npm run typecheck && npm test && npm run build` pass. Do not add e2e here.

### Out of this stream

SVG, MapScreen, e2e, player-guide prose, compose UI.

---

## Stream B — SVG city (CITY-MAP 2, 5.4, 6)

Finish `CityMapSvg` / `layout.ts` against the prototype (`docs/design/prototypes/city-map.html` and `city-map-*.png`) and the visual spec.

### Done when

- One inline SVG, ≤ 60 KB serialized and ≤ 1,500 elements on a ring-7, 10-outpost, two-residue fixture (test already sketched in `CityMapSvg.test.tsx` — make it pass for real).
- No canvas, `<image>` or SVG filters; one 2-stop radial gradient; ≤ 16 patterns; no `data-*` on map elements (WeakMap for hit-testing).
- Layout seeded from `fnv1a(firstPlayDay)` (the screen passes the seed); landmarks fixed by zone; 221 island cells; painter's order as 6.2.
- Tile states: claimed, dawn (next-zone cells inside `wallR`), corridor-lit, fog/static. Wall ellipse follows `wallRadius(dp)`; creep stops at 85% of the gap.
- Pins 6.3: marked / scouted / corridor / stronghold / quiet; 44px hit; type icons via `<symbol>` from `src/assets/outposts/`.
- Residue 2.4: 2/3/4 scorch marks, walls-held flag 7 days, fade 14 days.
- Corridors 3.4: dotted trail beyond the wall; corridor strip; stronghold bubble; supply line inside the wall. Visual only (no DP).
- *7 days* ghost wall + hatch band when `compareWallR` is set.
- CSS-only wall march / breathe / ripple; `prefers-reduced-motion` (prop `reducedMotion`) disables all of it and sets the wall instantly.
- Tests: layout deterministic per seed; SVG budget; keyboard bands and pins; reduced motion leaves no `.pop` / marching animation.
- `npm run lint && npm run typecheck && npm test && npm run build` pass.

### Out of this stream

MapScreen chrome, sheets, e2e, engine numbers.

---

## Stream C — Map tab UX, compose default, responsive

Finish the Map tab and every other surface that mentions outposts. Spec: CITY-MAP 2.3, 2.5, 3.1–3.6, 5.1–5.3, 7 step 8.

### Gaps to close (WIP is incomplete here)

1. **Compose default outpost.** Engine already stores `CustomTemplate.outpostId`. Add an optional outpost picker to `ComposeQuestSheet` (active outposts only, “None”) so a custom quest auto-tags. Copy under `strings.compose` / `strings.map`. Tests in `ComposeQuestSheet.test.tsx`.
2. **Place on map (optional extra, 3.1).** Form already has zone + compass + `suggestOutpostCell`. Add optional free-cell dots on a tiny map / existing SVG so a tap can set `cell`. Selects stay the default accessible path. Keyboard users never need the dots.
3. **Tablet two columns (5.1, RESPONSIVE-RULES 8).** `MapScreen.module.css` already has `.cols`; make 768+ actually two columns with docked sheets, not a phone frame in a void. Landscape (`max-height: 500px`): compact HUD, icon-only 5-tab bar still 44px.
4. **Five-tab bar.** Confirm `repeat(5, minmax(0, 1fr))`, labels wrap, 320px does not overflow, landscape icon-only. Settings stays in the bar.
5. **Sheets.** Zone, outpost, form: focus trap, Escape restores focus, `flex-start` + internal scroll, 44px targets. List view is complete (every map action reachable).
6. **Settlement “Where were you?”** Keep `WhereWereYou` on `questDone`; up to three related outposts; never blocks dismiss. Undo of a tagged quest already drops the visit in the engine.
7. **Ledger OutpostsSection.** Restore / two-step Forget for retired only; empty state links to Map.
8. **Responsive checklist** on Map: 320x568, 390x844 at 150% text, 844x390, 768x1024. No horizontal overflow.

### Done when

- MapScreen unit tests in `MapScreen.test.tsx` pass and cover: heading + seven bands, zone sheet + Escape, list view, create + visit + undo, edit + retire, cap refusal, `markMapSeen` on unmount.
- Compose test: picking an outpost writes `outpostId`; completing the quest tags it (through the store).
- `npm run lint && npm run typecheck && npm test && npm run build` pass. Run `npm run e2e` if the map spec already exists; otherwise leave screenshots to stream D.

### Out of this stream

Engine rules, SVG internals, writing `e2e/map.spec.ts`, player-guide chapters.

---

## Stream D — E2E, a11y, visuals, player docs

Spec: CITY-MAP 7 “E2E” and “Acceptance criteria”, plus docs that still describe four tabs.

### Done when

`e2e/map.spec.ts` covers:

- Five tabs; Map by click and keyboard; Settings intact.
- Fresh save shows the lit Room.
- Create an outpost via the form; log *I was there* (“Logged today”, survives reload).
- Tag a quest in the settlement sheet; undo; count falls back.
- Zone sheet from a building tap and from a band by keyboard; Escape restores focus.
- List view rows open sheets.
- 320x568, 390x844 at 150%, 844x390 and 1024x768 pass the responsive checks used in `e2e/responsive.spec.ts`.
- Reduced motion: `document.getAnimations()` empty on `#city-map` (filter to that subtree if the rest of the app has allowed animations).
- `#city-map` serializes under 60,000 characters on a ring-7 fixture (use the debug hook to set DP / outposts).

Also:

- Add Map to `e2e/a11y.spec.ts` (axe serious/critical = 0) and 44px check.
- Add Map screenshots to `e2e/visual.spec.ts` (fresh Room, list, zone sheet, outpost pin, 7-days if easy).
- Include Map in `e2e/responsive.spec.ts` contact sheets.
- **Player guide:** a City Map / outposts section (no GPS, visits pay nothing, states and perks in plain words, quiet is not a penalty).
- **ARCHITECTURE.md:** fifth screen, save v4 `map`, new engine modules.
- **README.md:** Map in the screenshot table and project layout; live URL unchanged.
- **CLAUDE.md** docs map: add this file.

`npm run e2e` must pass. If a UI bug blocks a spec, skip only that assertion with a comment pointing at the CITY-MAP paragraph — do not rewrite MapScreen (that is stream C).

### Out of this stream

Engine, SVG layout, Compose sheet structure.

---

## Merge order

1. Land A (engine) first if store signatures moved; otherwise A/B/C can merge in any order.
2. Land B and C.
3. Land D last so e2e runs against the real UI.
4. Orchestrator verifies `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` on the integration branch and opens one PR to `main`.

Acceptance (CITY-MAP 7) after the four streams:

- Wall follows `wallRadius(dp)` with dawn cells; crossing a threshold lights the zone after the unlock overlay.
- Opening the tab animates from `lastSeen` (static with reduced motion) and shows the DP delta; *7 days* shows a real snapshot.
- Outposts can be created, visited, tagged, edited, moved, retired, restored and forgotten within the caps, with warm copy for every refusal; perks apply as 3.3.
- Tap and keyboard; list view complete; axe clean.
- SVG under 60 KB and 1,500 elements worst case; RESPONSIVE-RULES checklist passes.
- v2 and v3 saves migrate to v4; `pacing.test.ts` unchanged.

---

## What this is not

Do not implement source-analysis hooks 9 (citizens), shop registration, familiars, or push notifications. Those need their own design docs. QA nits from `docs/review/qa-report.md` (toast hover, import preview, iOS install hint) are not part of this parallel run.
