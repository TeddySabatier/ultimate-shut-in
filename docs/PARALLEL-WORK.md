# City Map: parallel implementation charter

Design source of truth: [docs/design/CITY-MAP.md](design/CITY-MAP.md) (sections 4–7). This document splits the implementation plan (section 7) into **five tracks** with disjoint file ownership so multiple cloud agents can work in parallel without merge conflicts.

**Base branch:** `main` (or the integration branch your coordinator names).  
**Feature branch suffix:** `-bcb0` (see [Branch naming](#branch-naming)).

---

## Merge order

Integrate in this order so each track can assume the previous tracks are on the branch:

1. **Track A — Content**
2. **Track B — Engine and save schema**
3. **Track C — State and selectors**
4. **Track D — UI and assets**
5. **Track E — E2E, responsive, a11y, visual** (depends on D)

Rebase your track onto the latest merged upstream before opening or updating a PR.

---

## Verification (every track)

Before push:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Track E additionally runs `npm run e2e` and reviews `e2e/__screenshots__/`. Tracks A–D must not edit `e2e/**` (Track E owns those files).

---

## Track A — Content

**Goal:** `outposts.json`, map copy in `strings.json`, `schema.md`, loader exports and `validateContent()` for outposts.

| Owns |
|------|
| `src/game/content/outposts.json` |
| `src/game/content/strings.json` (only `map.*`, `ui.tabs.map`, and any new map-related pools) |
| `src/game/content/schema.md` |
| `src/game/content/index.ts` (outpost types, loaders, `getOutpostType` / `getOutpostState`, outpost validation block) |
| `src/game/content/content.test.ts` |

**Do not touch:** `src/game/types.ts`, engine modules, React, or `e2e/**`.

---

## Track B — Engine and save schema

**Goal:** Save version 4, `MapState` / outpost types, geometry, outpost mutators, map snapshots, integrations (`board`, `economy`, `wave`, `tick`, `custom`), engine tests, `src/game/README.md` module map.

| Owns |
|------|
| `src/game/types.ts` |
| `src/game/save.ts`, `src/game/save.test.ts` |
| `src/game/mapGeometry.ts`, `src/game/mapGeometry.test.ts` |
| `src/game/outposts.ts`, `src/game/outposts.test.ts` |
| `src/game/map.ts`, `src/game/map.test.ts` |
| `src/game/board.ts`, `src/game/economy.ts`, `src/game/wave.ts`, `src/game/wave.test.ts` |
| `src/game/tick.ts`, `src/game/custom.ts` |
| `src/game/index.ts`, `src/game/index.test.ts`, `src/game/review.test.ts` |
| `src/game/README.md` |

**Do not touch:** `src/game/content/*.json` (except reading), `src/state/**`, `src/components/**`, `src/screens/**`, `e2e/**`.

---

## Track C — State

**Goal:** Store actions wrapping engine mutators, `mapView` projection, selectors, map-related toast copy wiring.

| Owns |
|------|
| `src/state/gameStore.ts`, `src/state/gameStore.test.ts` |
| `src/state/mapView.ts`, `src/state/mapStore.test.ts` |
| `src/state/selectors.ts` |
| `src/state/index.ts` |
| `src/components/overlays/eventText.ts` (map / outpost `GameEvent` strings only) |

**Do not touch:** engine files, map SVG/components, `e2e/**`, or `strings.json` (Track A).

---

## Track D — UI and assets

**Goal:** Map tab, SVG city, sheets and forms, settlement “Where were you?”, Ledger outposts section, fifth tab, routing.

| Owns |
|------|
| `src/assets/outposts/**`, `src/assets/ui/map.svg`, `src/assets/ui/compare.svg`, `src/assets/ui/list.svg` |
| `src/assets/index.ts`, `src/assets/assets.test.ts` |
| `src/components/map/**` |
| `src/components/OutpostsSection.tsx`, `src/components/OutpostsSection.module.css` |
| `src/components/TabBar.tsx`, `src/components/TabBar.module.css` |
| `src/components/RingHeader.tsx`, `src/components/RingHeader.module.css` |
| `src/components/AppShell.tsx`, `src/components/AppShell.module.css` |
| `src/components/overlays/WhereWereYou.tsx` |
| `src/components/overlays/OverlayHost.tsx`, `src/components/overlays/OverlayHost.test.tsx` |
| `src/components/overlays/RingUnlockWindow.tsx`, `src/components/overlays/WaveResultWindow.tsx` |
| `src/components/overlays/Toast.tsx`, `src/components/overlays/overlays.module.css` |
| `src/screens/MapScreen.tsx`, `src/screens/MapScreen.module.css`, `src/screens/MapScreen.test.tsx` |
| `src/screens/map/**` |
| `src/screens/HomeScreen.tsx`, `src/screens/CharacterScreen.tsx` (map chip / links only) |
| `src/App.tsx` (`/map` route) |

**Do not touch:** `src/game/**` (except imports), `src/state/**` (except consuming selectors), `eventText.ts` (Track C), `e2e/**`.

---

## Track E — E2E, responsive, a11y, visual

**Goal:** `e2e/map.spec.ts`, extend responsive / axe / visual specs per CITY-MAP section 7 step 9; confirm RESPONSIVE-RULES breakpoints for the Map tab.

| Owns |
|------|
| `e2e/map.spec.ts` (new) |
| `e2e/helpers.ts`, `e2e/settings.spec.ts`, and other e2e files only as needed for Map tab coverage |
| Responsive / visual / axe spec updates listed in CITY-MAP 7.9 |

**Depends on:** Track D merged. **Do not** change engine or content JSON except fixtures inside `e2e/**`.

---

## Status (integration branch `wip/map-tab` → feature work)

| Track | Status | Notes |
|-------|--------|--------|
| A — Content | **DONE** | `outposts.json`, `strings.map`, loader, `validateContent()`, `schema.md` documented on integration branch |
| B — Engine | **DONE** | Save v4, `mapGeometry`, `outposts`, `map`, wave/board/economy hooks, engine tests |
| C — State | **DONE** | `gameStore`, `mapView`, selectors, `eventText` map events |
| D — UI | **DONE** | Assets, `CityMapSvg`, `MapScreen`, sheets, `WhereWereYou`, TabBar, Ledger outposts |
| E — E2E | **DONE** | `e2e/map.spec.ts`, responsive/axe/visual Map coverage, ring-7 fixture |

Update this table when a track lands on `main`.

---

## Instructions for agents

### Branch naming

Create branches as:

```text
cursor/<short-slug>-bcb0
```

Example: `cursor/map-content-bcb0`, `cursor/map-e2e-bcb0`. Use lowercase slugs. Always append `-bcb0` for this milestone.

### File ownership

- **Never edit files owned by another track.** If you need a change elsewhere, note it in the PR description for the owning track or wait for merge order.
- Prefer **one track per agent / PR**. Cross-track changes belong on the integration branch after ordered merges.
- Read `docs/RESPONSIVE-RULES.md` before any Map CSS or layout work (Track D).
- Tone and refusal copy come from `strings.json` (Track A); engine returns stable error **codes** matched to `strings.map.errors`.

### Git and CI

1. Branch from the latest coordinator branch (usually `main` after prior tracks merge).
2. Implement only your track’s files.
3. Run full verification (see above) before every push.
4. Commit with clear messages; push with `git push -u origin cursor/<slug>-bcb0`.

### Coordinator checklist

- [ ] A merged → B rebased and merged → C → D → E  
- [ ] `SAVE_VERSION` 4 migrations tested (`save.test.ts`)  
- [ ] `pacing.test.ts` unchanged on green  
- [ ] Track E green with screenshots reviewed  

---

## Related docs

- [CITY-MAP.md](design/CITY-MAP.md) — behaviour, data model, acceptance criteria  
- [src/game/content/schema.md](../src/game/content/schema.md) — `outposts.json` and save `map` fields  
- [src/game/README.md](../src/game/README.md) — engine module map  
- [RESPONSIVE-RULES.md](RESPONSIVE-RULES.md) — layout and tap targets for the Map tab  
