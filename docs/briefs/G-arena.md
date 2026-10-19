# Brief G: The Arena (design, engine and UI): coins get a purpose, mini games plug in

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Deliverable | **two pull requests**, in two agent runs: **G1** (design and engine), then **G2** (UI and plug-in host) started from G1's branch and stacked on it |
| G1 branch and base | `feat/G1-arena-engine`, base `main` |
| G2 branch and base | `feat/G2-arena-ui`, base `feat/G1-arena-engine` (declared stack, see `docs/PARALLEL-WORK.md` 4.3) |
| PR titles | `feat(arena): design, Armory, runs and plug-in contract [G1]` and `feat(arena): Arena screen, lottery and mini-game host [G2]` |
| Reserved save version | **v7** (G1 bumps `SAVE_VERSION` to 7) |
| Merge order | after brief H (v5) and brief F (v6). See `docs/PARALLEL-WORK.md` 3. |
| Size | large |

Roguelike Chess, the first game, is brief P (wave 3). It needs the host from G2 merged. G1 still **writes its rules** so that P is a pure implementation task.

## Goal

Give the coins a purpose and add side games the players can request. Ship the whole loop: the spec, the engine, the content, the screens, the contract that lets any later game plug in.

## Decisions already made (elaborate them, do not re-litigate)

- Two currencies exist today: Settlement coins (earned per quest, few sinks) and Domain Points (never spent, they drive rings). **Coins become the Arena currency. Domain Points stay untouchable.**
- "Troops" are the vassals, and later the citizens (brief F). G1 defines a **roster provider** (`rosterFor(save)`) that returns vassals now and has a documented extension point for citizens; it must not import or depend on citizen code.
- **Armory** (the permanent sink): three gear slots per vassal with tiered items whose prices scale with ring; training (small permanent stat bumps with steep diminishing returns and a weekly cap, so coins cannot replace habits); Haven decor (cosmetic, from the existing combo item names).
- **Mini games are plug-ins.** A game is a self-contained module under `src/games/<id>/` with a manifest (id, name, description, icon, minimum ring, rules text, roster size, estimated minutes, supports reduced motion), a pure seeded `engine.ts` (no DOM, testable), and a React `Screen`. The host passes a `Party` (chosen troops with derived stats) and the current `Run`; the game returns an `Outcome` (`won | lost | fled`, score, log lines, troops used). **A game module never imports the Haven store.** This is what lets an agent add any requested game without touching the rest of the app.
- **Runs.** Entering costs an entry fee in coins (scaled by ring, never more than one day of typical earnings). A run chains games until a loss or until the player banks. Each win opens the **Lottery**: a weighted draw of three run buffs, pick one (for example +15% attack for the next game, a troop revives once, +2 wave defense banked at run end, a coin multiplier). Buffs live in `Run.buffs`. **A loss ends the run and clears every run buff.** The player always keeps what was banked and the Armory gear. Banking converts run rewards into coins, a one-period wave defense bonus (one new `arena` term in the wave breakdown, next to `outposts`) or a rare Armory item; never Domain Points directly.
- **Tone.** Losing a run is framed as "the troops come home". Arena results never touch streaks, loyalty or utilities. A daily time cap is suggested, not forced (the Arena is a reward, not the game). No real money anywhere.
- **Requested games.** An "Ask for a game" form in the Arena: the player describes the game they want (text or voice, reuse the compose input components), it is saved locally in `arenaRequests` with a date, and the app says the engineers are reading. Fulfilment is a development act: an agent builds a module against the contract and ships it in a release. The pipeline and a request template an agent can turn into a module in one session are documented.
- **Entry point.** The Arena is **not a sixth tab** (five tabs fit at 320px, six do not). It is a card on the Haven screen below the recent log, opening the Arena screen at `#/arena`.
- Everything is original. Nothing from the source work.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/PARALLEL-WORK.md` (section 4), `docs/RESPONSIVE-RULES.md`, `docs/design/GDD.md` (economy, titles, combos, wave, tone), `docs/design/GDD-errata.md`, `docs/design/CITY-MAP.md` (how a feature spec and its engine fit together here), `docs/design/ART.md`, `src/game/README.md`, `src/game/economy.ts`, `src/game/types.ts`, `src/game/wave.ts`, `src/game/save.ts`, `src/screens/ComposeQuestSheet.tsx` (the voice and text input to reuse).

## G1: design, content and engine

You may edit:

- `docs/design/ARENA.md` (3000 to 5000 words): fantasy, Armory catalogue with prices, run loop, lottery buff table with weights, banking table, request flow, SaveFile addition as TypeScript, engine functions, events, wireframes at 390 and 768, accessibility, the economy proof below.
- `docs/design/games/CONTRACT.md`: the plug-in contract as TypeScript interfaces plus a ten-step "how an agent adds a game" recipe with a file tree and a test checklist.
- `docs/design/games/roguelike-chess.md`: complete rules for brief P. 6x6 board; the party are the pieces, each vassal mapped to a piece type by habit (Move = knight, Outside = bishop, Clean = rook, Social = queen-lite, Study = king, Sleep = pawn wall, Eat = rook-lite, Hygiene = bishop-lite); levels add HP, titles add one passive each; enemies are the wave monsters with simple scripted moves; three rooms with a pick-one-of-three upgrade between rooms; turn-based, no timer, fully keyboard playable, under three minutes; exact stats, enemy AI, 12 upgrades, win and loss conditions, and a seeded RNG so a game can be replayed.
- `src/game/arena/**` (new): `armory.ts`, `run.ts`, `lottery.ts`, `requests.ts`, `roster.ts`, with tests. Pure functions in the engine contract `(save, now, ...) => { save, events, error? }`.
- `src/game/content/arena.json` (new): gear, training curve, lottery buffs, fees. Document it in `schema.md` (append) and validate it in `content/index.ts` and `content.test.ts` (additive).
- `src/games/contract.ts` and `src/games/registry.ts` (new): the types from CONTRACT.md and an empty registry, with tests.
- `src/game/types.ts`, `src/game/save.ts`: add `arena` to `SaveFile` **right after the existing `map` field** (your anchor), bump `SAVE_VERSION` to 7, migration for 4, 5 and 6 (v5 has `notes`, v6 has `citizens`; each may be absent), the `arena` term in `WaveBreakdown`, events. Tests for every earlier version.
- `src/game/wave.ts`: the banked defense term. `src/game/index.ts`: additive exports.
- `src/game/content/strings.json`: **only your own top-level key `arena`**, inserted immediately before the existing `"benevolence"` key (your anchor).
- `docs/design/GDD-errata.md`: append entries. `docs/review/notes/G.md`.

## G1 hands off

Every file under `src/screens/`, `src/components/`, `src/state/`, `e2e/`, `.github/`, and everyone else's keys and sections.

## G1 acceptance

- A test that **computes** from `src/game/economy.ts`: a Steady player at 90% adherence can afford one run every two days, and weekly training can never exceed 25% of what habits give (assert the numbers, do not just print them).
- Engine tests: entry fee and refusal when short of coins, lottery weights and determinism from the seed, a loss clears buffs and keeps banked rewards and gear, banking converts correctly, the weekly training cap, request log limits, migration from v4, v5 and v6, input never mutated.
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass.

## G2: screens and plug-in host (stacked on G1)

Start G2 once G1 has its first green CI run; branch from G1's branch and set the PR base to it (label `stacked`, first line `Stacked on #<G1 number>. Merge that one first.`). You may edit:

- `src/screens/ArenaScreen.tsx`, `src/components/arena/**` (new): Armory, the run screen with the lottery pick and bank-or-continue, the "Ask for a game" form
- `src/games/host/**` (new): the host that mounts a module's `Screen` with a `Party`, collects the `Outcome`, applies it through the store. `src/games/sample/**`: a trivial coin-flip style game used only by the contract tests and a `?dev=1` list; it is **not** registered in production.
- `src/App.tsx`: one route `#/arena`. `src/screens/HomeScreen.tsx`: the Arena card **below the recent log** (your anchor), nothing else.
- `src/components/overlays/eventText.ts` and `OverlayHost.tsx`: additive cases for your events only.
- `src/assets/arena/**` (new): original SVG icons for gear, buffs and the Arena card; `src/assets/index.ts` and `assets.test.ts`: additive block.
- `src/state/gameStore.ts`: your actions as one block **at the end of the actions list** (your anchor).
- `e2e/arena.spec.ts` (new); the Arena screen as one additional case in `e2e/responsive.spec.ts`.
- `docs/PLAYER-GUIDE.md`: a new `## The Arena` section **right after `## Titles`** (your anchor). `docs/review/notes/G.md`.

Hands off: the G1 engine files (push engine changes to G1's branch), every other screen.

## G2 acceptance

- Every string from `strings.json` under `arena` (no hard-coded JSX text).
- The responsive rules at 320x568, 390x844 at 150% text and 844x390, with screenshots in the PR description. Keyboard and screen reader complete; reduced motion respected.
- e2e: buy gear, enter a run with the sample game, win and see the lottery, pick a buff, lose and see the buffs cleared with the gear kept, bank, send a game request, axe passes.
- The sample game proves the contract end to end: a test mounts it through the host, plays it with a seed and gets the same `Outcome` twice.
- `npm run lint`, `typecheck`, `npm test`, `npm run build` pass and the specs above pass on both projects.

## Prompts

Run 1, starting branch `main`:

> You are agent G1 on Haven Protocol. Read `AGENTS.md`, then `docs/PARALLEL-WORK.md` sections 1 and 4, then follow `docs/briefs/G-arena.md`, section "G1" only, exactly. Open a draft PR against `main` after your first commit using the PR template, and mark it ready only when the G1 acceptance list passes. Do not merge anything and do not start G2.

Run 2, started after G1 has a first green CI run, **starting branch `feat/G1-arena-engine`**:

> You are agent G2 on Haven Protocol. Read `AGENTS.md`, then `docs/PARALLEL-WORK.md` sections 1 and 4, then follow `docs/briefs/G-arena.md`, section "G2" only, exactly. Your starting branch is G1's branch: create `feat/G2-arena-ui` from it, open a draft PR whose base is `feat/G1-arena-engine` (not `main`) with the label `stacked` and the first line `Stacked on #<G1 PR number>. Merge that one first.`, and mark it ready only when the G2 acceptance list passes. Merge G1's branch into yours whenever G1 changes. Do not merge anything.
