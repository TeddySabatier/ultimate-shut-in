# Haven Protocol: rules for agents working in this repo

Mobile-first offline PWA habit RPG. Live: https://teddysabatier.github.io/ultimate-shut-in/ (deploys on push to `main`).

## Architecture (do not break)
- `src/game/` is a pure TypeScript engine: no React, no DOM, no storage. Every mutator is `(save, now, ...) => { save, events, error? }`, input never mutated, randomness seeded from the save. Read `src/game/README.md`.
- Content lives in `src/game/content/*.json` (documented in `schema.md`). Add quests, titles, combos, strings there, not in code.
- `src/state/gameStore.ts` is the only place that calls engine mutators; React components never compute rewards or dates.
- Save format is versioned (`SAVE_VERSION`); any schema change needs a migration and a migration test.
- Tone: warm, never punitive. The Haven never falls. Copy goes through `strings.json`.
- Everything is original: no names, art or text from the source work.

## Responsive UI (mandatory)
Read `docs/RESPONSIVE-RULES.md` before touching any CSS or screen. Short form: grids use `minmax(0, 1fr)`; fixed-size flex children get `flex: none`; no fixed px heights on content; overlays align `flex-start` with `margin-top: auto` and scroll internally; safe-area insets applied once; breakpoints for `max-width: 359px`, `min-width: 768px` and `max-height: 500px`; tap targets 44px; check 320x568, 390x844 at 150% text, and 844x390 before calling a screen done.

## Verification before any commit
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
Run `npm run e2e` for UI changes and look at the screenshots in `e2e/__screenshots__/`.

## Docs map
- Design: `docs/design/GDD.md` (+ `GDD-errata.md`), `ART.md`, `CITY-MAP.md`, `CUSTOM-QUESTS.md`
- Reviews: `docs/review/` (engine review, QA report, responsive review)
- Player and ops: `docs/PLAYER-GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`
