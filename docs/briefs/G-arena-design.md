# Brief G: The Arena, currency sinks and user-requested mini games (docs and prototypes only)

| | |
| --- | --- |
| Wave | 2 (start now) |
| Depends on | nothing |
| Base branch | `main` |
| Branch | `docs/G-arena-design` |
| PR title | `docs(design): Arena, Armory, plug-in mini-game contract and Roguelike Chess [G]` |
| Reserved save version | plans for **v7** (the build brief O will implement it) |
| Size | large, new files only, no code |

## Goal

Give the coins a purpose and add side games the players can request. Design it so engineers can build it in briefs O and P without questions.

## Decisions already made (elaborate them, do not re-litigate)

- Two currencies exist today: Settlement coins (earned per quest, few sinks) and Domain Points (never spent, they drive rings). Coins become the Arena currency. Domain Points stay untouchable.
- "Troops" are the vassals, plus citizens once they exist (brief N). The Arena uses the real roster: levels, loyalty, titles and forged combos become unit stats. Real-life progress is the only way to make troops stronger at the base.
- **Armory** (the permanent sink): three gear slots per vassal with tiered items whose prices scale with ring; training (small permanent stat bumps, steep diminishing returns, a weekly cap, so coins cannot replace habits); Haven decor (cosmetic, from the existing combo item names).
- **Mini games are plug-ins.** A game is a self-contained module under `src/games/<id>/` with a manifest (id, name, description, icon, minimum ring, rules text, roster size, estimated minutes, supports reduced motion), a pure seeded `engine.ts` (no DOM, testable), a React `Screen`, and an optional worker. The host passes a `Party` (chosen troops with derived stats) and the current `Run`; the game returns an `Outcome` (`won | lost | fled`, score, log lines, troops used). A game module must never import the Haven store directly. This contract lets a future agent add any user-requested game without touching the rest of the app.
- **Runs.** Entering costs an entry fee in coins (scaled by ring, never more than one day of typical earnings). A run chains games until a loss or until the player banks. Each win opens the **Lottery**: a weighted draw of three run buffs, pick one (for example +15% attack for the next game, a troop revives once, +2 wave defense banked at run end, a coin multiplier). Buffs live in `Run.buffs` and die with the run. **A loss ends the run and clears every run buff.** The player always keeps what was banked and the Armory gear. Banking converts run rewards into coins, a one-period wave defense bonus or a rare Armory item; never Domain Points directly.
- **Tone.** Losing a run is framed as "the troops come home". Arena results never touch streaks, loyalty or utilities. Suggest a daily time cap (the Arena is a reward, not the game). No real money anywhere.
- **User-requested games.** An "Ask for a game" flow in the Arena: the player describes the game they want (text or voice, reuse the compose input), it is saved locally in `arenaRequests` with a date, and the app says the engineers are reading. Fulfilment is a development act: an agent reads the requests, builds a module against the contract, ships it in a release, and the game appears in the Arena list. Document the pipeline, including a request template an agent can turn into a module in one session.
- **First game, the reference implementation: Roguelike Chess.** 6x6 board; the party are the pieces, each vassal mapped to a piece type by habit (Move = knight, Outside = bishop, Clean = rook, Social = queen-lite, Study = king, Sleep = pawn wall, Eat = rook-lite, Hygiene = bishop-lite); levels add HP, titles add one passive each; enemies are the wave monsters with simple scripted moves; three rooms per game with a pick-one-of-three upgrade between rooms; turn-based, no timer, fully keyboard-playable, under three minutes a game. Define exact rules, piece stats, enemy AI, 12 upgrades, win and loss conditions, and the seeded RNG so a game can be replayed.

## Read first

`AGENTS.md`, `docs/design/GDD.md` (economy, titles, combos, wave, tone), `docs/design/GDD-errata.md`, `src/game/economy.ts` (the actual numbers), `src/game/types.ts`, `src/game/wave.ts` (monsters), `docs/design/CITY-MAP.md`, `docs/design/ART.md`, `docs/RESPONSIVE-RULES.md`.

## You may create

- `docs/design/ARENA.md`, `docs/design/games/CONTRACT.md`, `docs/design/games/roguelike-chess.md`
- `docs/design/prototypes/arena.html`, `docs/design/prototypes/roguelike-chess.html`, `docs/design/prototypes/arena-*.png`, `docs/design/prototypes/roguelike-chess-*.png`, `docs/design/prototypes/assets/arena/**`
- `docs/review/notes/G.md`

## Hands off

Everything under `src/`, `e2e/`, `.github/`, and every existing doc.

## Deliverables

1. `ARENA.md` (3000 to 6000 words): fantasy, Armory catalogue with prices, run loop, lottery buff table with weights, banking table, request flow, SaveFile additions as TypeScript with a migration note (version 7), engine functions with the pure contract, events, wireframes at 390 and 768, accessibility, implementation plan with the exact files briefs O and P will create and edit, and tests.
2. `CONTRACT.md`: the plug-in contract as TypeScript interfaces, plus a ten-step "how an agent adds a game" recipe with a file tree and a test checklist.
3. `roguelike-chess.md`: complete rules and content tables.
4. `arena.html` (Armory, a run with the lottery pick and bank-or-continue, the request form) and `roguelike-chess.html` (a fully playable game against scripted enemies using your rules, seeded, keyboard playable, three rooms, under 60 KB of JavaScript). Screenshot both with Playwright at 320, 390 and 1024 widths, look at the screenshots, iterate until they read as finished game screens. Keep images under 2 MB in total.

## Acceptance

- A table, using real numbers from `src/game/economy.ts`, proving a Steady player can afford one run every two days and that training can never exceed 25% of what habits give.
- The prototype of Roguelike Chess can be won and lost, and a seeded replay reproduces the same game.
- Nothing copies from the source work.

## Prompt

> You are agent G. Read `AGENTS.md`, then follow `docs/briefs/G-arena-design.md` exactly, and the PR rules in `docs/PARALLEL-WORK.md` section 4. Branch from the latest `main`, open a draft PR against `main` after your first commit with the label `docs-only`, and mark it ready when every acceptance item passes.
