# Architecture

Haven Protocol is a static, offline-first single-page app. There is no server: the browser holds the whole game and its save. This document explains how the code is layered and why. For the rules themselves see the [GDD](design/GDD.md) and its [errata](design/GDD-errata.md); for the engine API see [`src/game/README.md`](../src/game/README.md).

## Layers

```
content JSON  ->  pure engine  ->  zustand store  ->  React screens  ->  overlays
src/game/content  src/game        src/state          src/screens        src/components/overlays
```

| Layer | Where | Responsibility |
| --- | --- | --- |
| Content | `src/game/content/*.json` | All data and copy: habits and vassals, 79 quest templates, 7 rings, 21 titles, combos, UI strings. Typed loaders and `validateContent()` live in `content/index.ts`. Schema in [`content/schema.md`](../src/game/content/schema.md). |
| Engine | `src/game/*.ts` | The rules, as pure functions over a `SaveFile`: board generation, rewards, loyalty and trust, utilities, waves, titles, combos, resurrection, day boundaries, save migration, and the City Map (`mapGeometry.ts`, `outposts.ts`, `map.ts`: zones and the creeping wall, outposts and their perks, domain snapshots). No React, no DOM, no `Date.now()`. |
| Store | `src/state/gameStore.ts` | One persisted zustand store (with immer) holding the engine's `SaveFile`. Every action calls an engine function and applies the result. No rule lives here. `src/state/mapView.ts` arranges engine results into the Map screen's read-only view model. |
| Screens | `src/screens/` | Haven (home), Board (quests), Map (`MapScreen.tsx` with the sheets in `screens/map/`), Ledger (character), Settings, Onboarding. Hash routing (`react-router-dom` `HashRouter`), mounted once a save exists and onboarding is done. |
| Overlays | `src/components/overlays/` | `OverlayHost` shows queued engine events one at a time: settlement toast, level-up, ring unlock, wave result, vassal windows. |

Shared UI pieces (`QuestCard`, `VassalCard`, `Meter`, `SystemWindow`, `TabBar`...) are in `src/components/`. The City Map itself is `src/components/map/`: `layout.ts` builds the seeded city once per save (symbols, tiles, building parts) and `CityMapSvg.tsx` renders one inline SVG from it, rewriting only class names when Domain Points change (budget: 60 KB and 1,500 elements serialised, see `docs/design/CITY-MAP.md` 5.4). Art is SVG under `src/assets/`, exported as URLs from `src/assets/index.ts`.

## The "pure, immutable, events-out" contract

This is the rule the whole codebase leans on.

- **Pure.** Same inputs give the same outputs. The current time and timezone are parameters (`now`, and an optional `tz` offset provider), never read from globals. Randomness comes from a seed derived from the save: boards use `fnv1a("firstPlayDay:day:name")` fed to `mulberry32`, battle logs use `fnv1a("firstPlayDay:periodIndex")`. Any day can be replayed.
- **Immutable.** A state-changing function never mutates its input. It clones the save once, edits the clone through internal `*Draft` helpers (`draft.ts`) and returns an `ActionResult`: `{ save, events, error? }`. If `error` is set the action was refused and `save` is the unchanged input.
- **Events out.** Anything the UI should announce (`questDone`, `levelUp`, `titleEarned`, `comboForged`, `ringUnlocked`, `waveSettled`, `catchUp`...) is returned as a `GameEvent`. The store forwards the events that screens present (`SHOWN_EVENTS`) to a queue, and `OverlayHost` consumes it. The store never derives toasts by diffing state.

Practical consequences: the engine is tested without a DOM, a bug report can be reproduced from a save file plus a timestamp, and the UI cannot get out of sync with the rules because it holds no rules.

The store's one clock is `src/state/clock.ts` (`now()`), which accepts a debug offset. A debug hook, `window.__haven` (`src/state/debug.ts`), is installed only in dev builds or when `localStorage['haven.debug'] === '1'`; it lets tests and developers shift the clock, read the save, tick, and reset.

## Save file, versioning and migration

- **Where.** `localStorage`, key `haven.save`, written by zustand's `persist` middleware as `{ state: { save, onboarded }, version: 2 }`.
- **Shape.** `SaveFile` (type in `src/game/types.ts`, described in GDD section 4): `version: 4`, `player`, `settings`, `vassals`, `utilities`, `board`, `week`, `combos`, `titles`, `stats`, `log`, `customTemplates`, `proposals`, `activity` (custom quests and adaptive proposals, see `docs/design/CUSTOM-QUESTS.md`), `map` (outposts, visits, domain snapshots, the last look at the map; see `docs/design/CITY-MAP.md` 4.1), `firstPlayDay`, `lastOpenDay`. Content is referenced by stable ids (never rename an id once shipped).
- **Versions.** v2 was the first `haven.save`; v3 added `customTemplates`, `proposals` and `activity`; v4 added `map` and `breakdown.outposts` on every wave record. A v3 save migrates with an empty map seeded with one snapshot of its current state, so the *7 days* compare has a baseline on day one.
- **Migration.** `migrate(raw, now)` in `src/game/save.ts` is the single entry point for anything that comes from outside the running engine: a persisted blob, an imported file, a legacy blob. It accepts the legacy `usi.player` shape (`{ name, level, xp }`) and v2 saves with or without a persist envelope, recognises v2 by shape (`player`, `settings`, `vassals`, `utilities`) so an old envelope version never downgrades a v2 save, fills missing fields with defaults, and normalises boards, combos, titles, wave history and the log so no `NaN` can reach the arithmetic.
- **Store side.** The persist envelope's own `migrate` and `merge` call `hydrateSlice`, which sends only the inner `save` through the engine's `migrate`. A legacy `usi.player` key is read once, migrated, then removed.
- **Export and import.** Settings exports `exportSave(save)` (plain JSON) as `haven-save-YYYY-MM-DD.json`; import parses the file, confirms with the player, and runs it through `migrate`. This is the only "sync".
- **Bumping the version.** Change `SAVE_VERSION` in `save.ts` and `STORAGE_VERSION` in `gameStore.ts` together, teach `migrate` to read the previous shape, and add a test in `save.test.ts`.

## Time model

All time rules live in `src/game/time.ts` and `src/game/tick.ts`.

- **Game day index.** `gameDayIndex(now, resetHour, tz)` takes the local wall clock of `now`, subtracts `settings.resetHour` (default 04:00), takes the calendar date, and returns whole days since the Unix epoch on that clock. A quest at 01:30 therefore belongs to the previous day. `firstPlayDay` is the index of the first open; most other values are absolute indices too.
- **Boundaries.** `processBoundaries(save, now)` is the one entry point on app open and every foreground event (`useGameTick`: on mount, on tab visible, every 60 s while visible). It replays each missed day boundary in order, applies utility and loyalty decay with the catch-up caps (7 loyalty decays per vassal, 3 utility decays per utility), resets streaks, settles waves, then issues today's board. At most 400 boundaries are replayed; longer absences are fast-forwarded with identical results (see errata 13).
- **Wave periods.** Period `i` covers game days `[7i, 7i+7)` from `firstPlayDay` and settles at the first boundary that crosses day `7(i+1)`, that is, the next time the app is opened. A period with zero trust settles as `quiet`.
- **Changing the reset hour.** Every stored day index lives in the frame defined by `resetHour`, so the hour must be changed with `changeResetHour(save, hour, now)`, which shifts all indices so "today" stays today and the day ends at the next occurrence of the new hour. Writing `settings.resetHour` directly is unsupported.
- **Clock going backwards.** `processBoundaries` never replaces a board for today or a later day, so a clock set back keeps the current board and undo keeps working.
- **DST.** The timezone offset is evaluated at `now`, so the boundary stays at the reset hour on the new clock on change-over days; that game day lasts 23 or 25 hours and the index never decreases (errata 10). Tests inject `fixedTz(offsetMinutes)`.

## PWA and service worker strategy

Configured in `vite.config.ts` with `vite-plugin-pwa` (Workbox `generateSW`):

- **Precache.** `globPatterns: ['**/*.{js,css,html,svg,png,woff2}']` precaches the built app shell and assets; with `navigateFallback: 'index.html'` the app opens offline. Hash routing means there are no server routes to worry about.
- **Updates.** `registerType: 'autoUpdate'`: a new service worker activates and the page reloads on its own; `cleanupOutdatedCaches` drops old precaches. Registration is manual (`injectRegister: false`) in `src/pwa/registerSW.ts`, called from `main.tsx`.
- **Runtime caching.** Google Fonts only: stylesheets `StaleWhileRevalidate`, font files `CacheFirst`, each with expiry. These are the only third-party requests; the app falls back to system fonts without them.
- **Manifest.** Name "Haven Protocol", `display: standalone`, portrait, `start_url` and `scope` `./`, four icons (192 and 512, plus maskable) generated by `npm run icons` from `src/assets/logo/mark.svg`.
- **Relative base.** `base: './'` makes every URL relative, so the same `dist/` works at a domain root or under `/ultimate-shut-in/` on GitHub Pages.
- **CI check.** `ci.yml` asserts `dist/manifest.webmanifest` and `dist/sw.js` exist after the build.
- **Dev.** The service worker is disabled in `vite dev` (`devOptions.enabled: false`); use `npm run build && npm run preview` to test offline behaviour.

## Testing strategy

| Level | Where | What it protects |
| --- | --- | --- |
| Unit (engine) | `src/game/*.test.ts` | Each rule module with fixed `now`, seed and timezone: board generation, rewards, undo, loyalty, utilities, waves, titles, combos, resurrection, time, save migration, map geometry, outposts (caps, visits, perks, immutability, DP and ring never touched) and domain snapshots. |
| Content validation | `src/game/content/content.test.ts` | `validateContent()` runs at test time, so a broken JSON cross-reference or invariant fails CI. |
| Engine review regressions | `src/game/review.test.ts` | One regression test per finding of [`review/engine-review.md`](review/engine-review.md). |
| Pacing simulation | `src/game/pacing.test.ts` | A seeded 365-day simulation through the public API asserts ring arrival weeks within tolerance of the GDD table and zero wave losses at 90% adherence, so economy tweaks are caught. |
| Component and store | `src/**/*.test.tsx`, `src/state/*.test.ts` | Testing Library tests for screens, `QuestCard`, overlays and the store, using `src/test/` helpers (`localStorage` cleared after each test). `src/components/map/CityMapSvg.test.tsx` asserts the serialised map's size budget on the worst-case fixture (ring 7, ten outposts, two waves of residue). |
| Assets | `src/assets/assets.test.ts` | SVG rules from the [art guide](design/ART.md): `xmlns` and `viewBox`, no scripts or text, gradient limits. |
| End to end | `e2e/`, Playwright (`playwright.config.ts`) | Browser flows against a production build served by `vite preview`, at a phone and a desktop viewport, using the debug hook for time travel. |
| Accessibility | `@axe-core/playwright` (dev dependency) | Automated axe checks, run from e2e specs against each screen. |

CI (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` on every push and pull request, checks the PWA artifacts, then runs `npm run e2e` in a second job.
