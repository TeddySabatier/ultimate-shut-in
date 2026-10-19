# Brief G: The Arena (design, engine and UI): coins get a purpose, the mini games get a home

| | |
| --- | --- |
| Program | Overnight program, see `docs/OVERNIGHT.md` |
| Depends on | the games foundation (plug-in contract, registry, lab), already merged |
| Starting branch and PR base | **`integration/arena`** (not `main`) |
| Deliverable | **two pull requests from one run**: **G1** (design and engine) on `feat/G1-arena-engine`, then **G2** (screens and host) on `feat/G2-arena-ui` stacked on G1. Both are marked ready when done; a workflow merges them into `integration/arena` and retargets G2 by itself. |
| PR titles | `feat(arena): design, Armory, runs and lottery engine [G1]` and `feat(arena): Arena screen, lottery and mini-game host [G2]` |
| Reserved save version | **v5** (G1 bumps `SAVE_VERSION` from 4 to 5) |
| Size | large |

Eleven other agents are building the mini games into `src/games/<id>/` at the same time. **You never edit those folders and they never edit yours.** Your job is the platform around them: the economy, the run loop, the screens, and the host that plays whatever the registry lists.

## Goal

Give the coins a purpose and a home for the games. Ship the whole loop: the spec, the engine, the content, the screens, the host.

## Decisions already made (elaborate them, do not re-litigate)

- Two currencies exist: Settlement coins (earned per quest, few sinks) and Domain Points (never spent, they drive rings). **Coins become the Arena currency. Domain Points stay untouchable.**
- "Troops" are the vassals now, and citizens later. `rosterFor(save)` returns the vassals as `PartyMember`s (the type from `src/games/contract.ts`); document the extension point for citizens; never depend on citizen code.
- **Armory** (the permanent sink): three gear slots per vassal with tiered items, prices scaling with ring; training (small permanent stat bumps, steep diminishing returns and a weekly cap so coins cannot replace habits); Haven decor (cosmetic, from the existing combo item names). Gear and training change the troop's `power` and `traits` in the `Party` the host builds.
- **Runs.** Entering costs an entry fee in coins (scaled by ring, never more than one day of typical earnings). A run chains games until a loss or until the player banks. The host picks the next game from `listGames()` (hides `devOnly`), filtered by `minRing`, seeded, never the same game twice in a row when more than one is eligible. Each win opens the **Lottery**: a weighted draw of three run buffs (the `RunBuff` kinds from the contract: `attack`, `defense`, `time`, `hint`, `revive`, `luck`), pick one. Buffs live in `Run.buffs` and are passed to every following game through `RunContext`. **A loss ends the run and clears every run buff.** The player always keeps what was banked and the Armory gear. Banking converts the run's rewards into coins, a one-period wave defense bonus (one new `arena` term in the wave breakdown next to `outposts`) or a rare Armory item; never Domain Points directly. `Outcome.score` scales the reward; `Outcome.learned`, when present, is shown after the game and kept in the run log.
- **Tone.** Losing a run is "the troops come home". Arena results never touch streaks, loyalty or utilities. A daily time cap is suggested, not forced. No real money anywhere.
- **Requested games.** An "Ask for a game" form: the player describes the game they want (text or voice, reuse the compose input components), it is saved locally in `arenaRequests` with the date, and the app says the engineers are reading. Document how an agent turns a request into a module using `docs/design/games/CONTRACT.md` (a request template).
- **Entry point.** The Arena is **not a sixth tab** (five fit at 320px, six do not). It is a card on the Haven screen below the recent log, opening the Arena screen at `#/arena`.
- Everything is original. Nothing from the source work.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/OVERNIGHT.md`, `docs/RESPONSIVE-RULES.md`, `docs/design/games/CONTRACT.md`, `src/games/contract.ts`, `src/games/registry.ts`, `src/games/lab/` and `src/games/sample/` (the reference game), `docs/design/GDD.md` (economy, titles, combos, wave, tone), `docs/design/GDD-errata.md`, `docs/design/CITY-MAP.md` (how a feature spec and its engine fit together here), `docs/design/ART.md`, `src/game/README.md`, `src/game/economy.ts`, `src/game/types.ts`, `src/game/wave.ts`, `src/game/save.ts`, `src/screens/ComposeQuestSheet.tsx` (the voice and text input to reuse).

## G1: design, content and engine

You may edit:

- `docs/design/ARENA.md` (3000 to 5000 words): fantasy, Armory catalogue with prices, run loop, lottery buff table with weights, banking table, request flow, SaveFile addition as TypeScript, engine functions, events, wireframes at 390 and 768, accessibility, the economy proof below, and how the host maps `Outcome` to rewards.
- `src/game/arena/**` (new): `armory.ts`, `run.ts`, `lottery.ts`, `requests.ts`, `roster.ts`, `party.ts` (builds the contract's `Party` from the save, gear and training), with tests. Pure functions in the engine contract `(save, now, ...) => { save, events, error? }`.
- `src/game/content/arena.json` (new): gear, training curve, lottery buffs, fees. Document it in `schema.md` (append) and validate it in `content/index.ts` and `content.test.ts` (additive).
- `src/game/types.ts` and `src/game/save.ts`: add `arena` to `SaveFile` **right after the existing `map` field**, bump `SAVE_VERSION` to 5, migration from 4 (and tolerant of 2 and 3 as today), the `arena` term in `WaveBreakdown`, events. Tests for every earlier version.
- `src/game/wave.ts`: the banked defense term. `src/game/index.ts`: additive exports.
- `src/game/content/strings.json`: **only your own top-level key `arena`**, inserted immediately before the existing `"benevolence"` key.
- `docs/design/GDD-errata.md`: append entries. `docs/review/notes/G.md`.

**Hands off:** `src/games/**` (read only), every file under `src/screens/`, `src/components/`, `src/state/`, `e2e/`, `.github/`.

### G1 acceptance

- A test that **computes** from `src/game/economy.ts`: a Steady player at 90% adherence can afford one run every two days, and weekly training can never exceed 25% of what habits give (assert the numbers).
- Engine tests: entry fee and refusal when short of coins, lottery weights and determinism from the seed, a loss clears buffs and keeps banked rewards and gear, banking converts correctly, the weekly training cap, request log limits, migration from v4, the party builder (gear and training change `power` and `traits` and stay within the contract ranges), input never mutated.
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass.

## G2: screens and host (stacked on G1)

Start G2 once G1 is pushed with green CI; branch from G1's branch (`feat/G1-arena-engine`) and open the PR with that branch as its base, label `stacked`, first description line `Stacked on #<G1 number>. Merge that one first.` You may edit:

- `src/screens/ArenaScreen.tsx`, `src/components/arena/**` (new): Armory, the run screen with the lottery pick and bank-or-continue, the "Ask for a game" form, a list of available games with their taglines and what they teach.
- `src/components/arena/host/**` (new; **not** `src/games/host`, that folder is reserved and the lint boundary blocks the store there): mounts a game's lazily loaded Screen with the built `Party` and `RunContext`, collects the `Outcome`, **validates it with `outcomeProblems` before applying it to the save** (an invalid outcome is logged and treated as `fled` with score 0, never trusted), applies it through the store, handles Exit (`fled`). The host lists games with `listGames({ includeDev: debugEnabled() })` so the dev sample game appears in tests but never to players. A game that finishes right after `onExit` in the same task keeps its own outcome (see CONTRACT.md). Treat an empty game list gracefully ("No games yet") because the games are being built in parallel. **Load `ArenaScreen` with `React.lazy()` in `src/App.tsx`** (the other screens are eager; the Arena must not be) and import the host only from inside it. **The registry is lazy**: import `src/games/registry` only from files that are themselves loaded lazily (the Arena screen is a lazy route); the lint rule forbids importing it from `App.tsx`, `main.tsx`, `src/state/**` and the shallow files of `src/components/`, so players never download every game up front.
- `src/App.tsx`: one route `#/arena`. `src/screens/HomeScreen.tsx`: the Arena card **below the recent log**, nothing else.
- `src/components/overlays/eventText.ts` and `OverlayHost.tsx`: additive cases for your events.
- `src/assets/arena/**` (new): original SVG icons for gear, buffs and the Arena card; `src/assets/index.ts` and `assets.test.ts`: additive block.
- `src/state/gameStore.ts`: your actions as one block **at the end of the actions list**.
- `e2e/arena.spec.ts` (new); the Arena screen as one additional case in `e2e/responsive.spec.ts`.
- `docs/PLAYER-GUIDE.md`: a new `## The Arena` section **right after `## Titles`**. `docs/review/notes/G.md`.

### G2 acceptance

- Every string from `strings.json` under `arena` (no hard-coded JSX text).
- The responsive rules at 320x568, 390x844 at 150% text and 844x390, with screenshots in the PR description. Keyboard and screen reader complete; reduced motion respected.
- e2e: buy gear, enter a run, play the dev sample game through the host (enable `localStorage haven.debug` so dev-only games are listed in the test), win and see the lottery, pick a buff, lose and see the buffs cleared with the gear kept, bank, send a game request, axe passes.
- A test mounts the host with every registered game via the lab's bot and checks each returns a valid `Outcome` the host can apply (this keeps working as games merge).
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass and the specs above pass on both projects.

## Process

Same as the games (`docs/briefs/games/README.md`, "Process"): draft PR after the first commit, push after every milestone, mark ready when the acceptance list passes, never merge anything yourself, decide alone when blocked and write it in `docs/review/notes/G.md`.

## Prompt

> You are agent G, the Arena, on Haven Protocol. Read `AGENTS.md`, then `docs/OVERNIGHT.md`, then `docs/PARALLEL-WORK.md` section 4, then follow `docs/briefs/G-arena.md` exactly. Your starting branch and your PR base are `integration/arena`. Deliver G1 (branch `feat/G1-arena-engine`) first, then G2 (branch `feat/G2-arena-ui`) stacked on G1. Open each as a draft PR after its first commit using the PR template, mark each ready when its acceptance list passes, and do not merge anything. Nobody is available to answer questions: decide yourself and write the decision in your notes file.
