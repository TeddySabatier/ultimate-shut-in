# Contributing

Working on a brief with other agents or people in parallel? Read [`AGENTS.md`](AGENTS.md) and [`docs/PARALLEL-WORK.md`](docs/PARALLEL-WORK.md) first: they define branches, pull requests, stacking and which files each task may touch.

Thanks for helping with Haven Protocol. Please read the [non-affiliation note](README.md#non-affiliation) first: all names, text and art must be original, and nothing from the source work that inspired the project may be copied in.

## Setup

Node 20 or newer (CI uses 24).

```sh
npm install
npm run dev      # http://localhost:5173
```

## Checks

Run these before opening a pull request; CI runs these plus the e2e suite.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run e2e` runs the Playwright browser suite (install the browser once with `npx playwright install chromium`); CI runs it too. `npm run test:watch` re-runs tests as you edit. `npm run build` also typechecks. `npm run preview` serves the production build with the service worker.

## Where things live

| You want to change | Edit |
| --- | --- |
| Quests, rings, titles, combos, vassals, copy | `src/game/content/*.json` (schema in `src/game/content/schema.md`) |
| A rule (rewards, waves, decay...) | `src/game/*.ts` and its colocated `*.test.ts` |
| What a button does | `src/state/gameStore.ts` (it only calls the engine) |
| A screen or component | `src/screens/`, `src/components/` |
| Art | `src/assets/` (see `docs/design/ART.md`) |

## Content is JSON

Content is data, so most additions need no TypeScript. Ids are stable strings that player saves reference: never rename or reuse one once shipped. `validateContent()` runs in the test suite and fails on broken references.

**Add a quest** (`quests.json`): append to `quests` an object with `id` (`"<habit>.<slug>"`, unique), `habit`, `title` (28 characters or fewer), `description`, `tier` (1 to 3), `minRing` (1 to 7), `kind` (`check`, `timer` with `durationMin`, or `count` with `targetCount`), `baseXp`, `baseCoins` (around the tier default) and `tags`. Keep the tone: warm, second person, no shaming, no medical or diet claims.

**Add a combo** (`combos.json`): append an object with `id`, `name`, `habits` (two habit ids that are not already paired), `power` (4, or 5 for pairs involving Outside, Social or Sleep) and `flavor`. Combos forge, expire and count automatically.

**Add a title** (`titles.json`): append an object with `id`, `name`, `flavor`, a `condition` and an `effect` using the existing types (listed in the schema). If you need a new condition or effect type, also implement it in `src/game/titles.ts` (and its description in the Ledger screen), add it to `schema.md`, and cover it with a test. Keep effects small and within `stackCaps`.

After any content change, run `npm test`. If you change numbers that affect pacing, check `src/game/pacing.test.ts` and update [`docs/design/GDD-errata.md`](docs/design/GDD-errata.md) when the code departs from the GDD.

## The engine stays pure

Everything in `src/game/` must stay a pure function over a `SaveFile`:

- no React, zustand, DOM or `localStorage` imports,
- no `Date.now()`, `Math.random()` or timezone reads; take `now` and a seed as parameters,
- never mutate the input save; clone, edit the draft, return `{ save, events, error? }`,
- report anything the UI should announce as a `GameEvent`.

If a rule needs a new piece of state, put it in the engine and the save schema (with a `migrate` step and a test), not in a component. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`src/game/README.md`](src/game/README.md).

## Pull request checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] New or changed rules have tests next to them; engine code is still pure.
- [ ] Save format changes bump the version, migrate old saves and are tested.
- [ ] Content ids are unchanged for anything already shipped.
- [ ] New copy is original, warm and never blames the player; negative messages include the fix.
- [ ] UI changes work at 480 px wide, with a keyboard, with reduced motion, and keep 44 px touch targets.
- [ ] Docs updated if behaviour changed (player guide, GDD errata, architecture).
- [ ] Art is original and follows `docs/design/ART.md`; it is covered by the CC BY 4.0 licence in `LICENSE-ASSETS`.
- [ ] The PR description explains what and why. Code is MIT, art is CC BY 4.0, and by contributing you agree to those licences.
