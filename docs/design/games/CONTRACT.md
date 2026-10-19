# Mini-game plug-in contract

How a mini game plugs into Haven Protocol. A game is one self-contained folder, `src/games/<id>/`. It is discovered automatically: adding a game edits **no shared file**. The Arena (brief G) and the Games Lab (`#/lab`) talk to a game only through the types below. One reusable test kit proves each game.

Source of truth: `src/games/contract.ts` (types and helpers), `src/games/registry.ts` (discovery), `src/games/testing/` (fixtures and the contract kit), `src/games/ui/` (hooks for Screens), `src/games/sample/` (the reference game, Coin Duel). If this page and the code disagree, the code wins. Say so in your notes file.

Contents: 1 Vocabulary · 2 File layout · 3 Types · 4 Engine rules · 5 Screen rules · 6 Party and buffs · 7 Boundaries (ESLint) · 8 Accessibility and responsive · 9 Offline · 10 Size budgets · 11 The test kit · 12 Games Lab · 13 Recipe: add a game in ten steps · 14 Troubleshooting

## 1. Vocabulary

| Word | Meaning |
| --- | --- |
| **Module** | What `manifest.ts` default-exports: `{ manifest, engine, strings }` (`GameModule`). |
| **Engine** | The pure rules: `initial`, `reduce`, `outcome`, `botPlay`. No React, no DOM, no clock. |
| **Screen** | The React UI (`Screen.tsx`), loaded lazily. Plays the engine. |
| **Party** | The troops the player brings: vassals with level, loyalty and power. |
| **Run** | The Arena run the game sits in: buffs from the lottery, the room index and a difficulty from 1 to 5. |
| **Outcome** | What the game answers: `won`, `lost` or `fled`, a 0..1000 score, log lines, the troops used. |
| **Bot** | `botPlay`: a simple competent player, so tests and the Lab can play any game headlessly. |

## 2. File layout

Every brief states this layout. Names are fixed: the registry, the layout test and the budget script look for them.

```
src/games/<id>/                 <id> is kebab-case and equals manifest.id
  manifest.ts                   default export defineGame({ manifest, engine, strings }); no React
  engine.ts                     pure rules, exports `engine` and the state/action types
  strings.ts                    defineStrings({ en: {...}, fr: {...} })
  Screen.tsx                    default export: React component taking GameScreenProps
  Screen.module.css             tokens only (src/styles/tokens.css)
  engine.test.ts                this game's own rules
  contract.test.ts              describeGameContract(game, { folder: folderOf(import.meta.url) })
  Screen.test.tsx               recommended: the Screen plays the engine's game
  *.png, *.svg, ...             assets live in the folder (200 KB at most)
e2e/games/<id>.spec.ts          plays the game through the Lab (copy e2e/games/sample.spec.ts)
docs/games/<id>.md              rules, "## Party" and "## Buffs" sections (copy docs/games/sample.md)
docs/games/img/<id>-*.png       screenshots written by the e2e spec (shootGame)
```

Reserved folder names (never a game id): `lab`, `testing`, `ui`, `host`, `shared`. `src/games/registry.test.ts` fails if a game folder misses a file of this layout, if `contract.test.ts` does not call `describeGameContract`, or if the docs page, its two sections or the e2e spec are missing.

## 3. Types

All in `src/games/contract.ts`. Names and signatures are fixed.

### Identity and text

- `GameId`: a kebab-case string (`GAME_ID_PATTERN`), at most 32 characters, equal to the folder name.
- `GameCategory = 'strategy' | 'ai-learning' | 'self-development' | 'puzzle' | 'arcade' | 'defense'`. Lists sort in this order (`GAME_CATEGORIES`).
- `LocalizedText = { en: string; fr: string }`. Both languages, both non-empty.
- `Locale = 'en' | 'fr'`.

### `GameManifest`

| Field | Type | Rule |
| --- | --- | --- |
| `id` | `GameId` | kebab-case, equals the folder, not reserved |
| `name` | `LocalizedText` | at most 32 characters per language |
| `tagline` | `LocalizedText` | one line, at most 100 characters |
| `category` | `GameCategory` | |
| `minRing` | `1..7` | the ring the player must reach before the Arena offers it |
| `rosterSize` | `{ min, max }` | integers, `1 <= min <= 3` (a new player has three vassals), `min <= max <= 8` |
| `estMinutes` | number | 1 to 5 |
| `supportsReducedMotion` | `true` | a promise: every game honours `reducedMotion` |
| `learning?` | `{ skill: LocalizedText; concepts: string[] }` | required for `ai-learning` |
| `devOnly?` | boolean | hidden from `listGames()` (the Arena), shown in the Lab |

Unknown fields fail the contract test (it catches typos like `devonly`).

### Party

```ts
interface PartyMember {
  id: string;            // vassals use their habit id: 'move'
  name: string;          // 'Pell' (never translated)
  habit: HabitId | null; // null for members that are not vassals (later: citizens)
  level: number;         // 1..30
  loyalty: number;       // 0..100
  power: number;         // 1..100 = derivePower(level, loyalty): 3 per level + loyalty / 10, clamped
  traits: string[];      // ids of earned titles (src/game/content/titles.json)
}
interface Party { members: PartyMember[] }
```

Helpers: `derivePower(level, loyalty)`, `makeMember({...})` (computes `power`), `fitParty(party, manifest)` (the first `rosterSize.max` members: the host calls it, the kit does the same).

### Run

```ts
interface RunBuff { id: string; kind: 'attack' | 'defense' | 'time' | 'hint' | 'revive' | 'luck'; amount: number }
interface RunContext { buffs: RunBuff[]; roomIndex: number; difficulty: 1 | 2 | 3 | 4 | 5 }
```

Helpers: `buffAmount(run, kind)` sums every buff of a kind (0 if none), `emptyRun(difficulty = 1)`.

### Outcome

```ts
type GameResult = 'won' | 'lost' | 'fled';
interface Outcome {
  result: GameResult;
  score: number;        // integer 0..1000 (clampScore(raw) rounds and clamps)
  log: string[];        // at least one line, no empty line
  troopsUsed: string[]; // subset of the party's member ids, no duplicates
  durationMs?: number;  // wall time, set by the Screen (useEngine), never by the engine
  learned?: { topic: LocalizedText; note: LocalizedText };
  stats?: Record<string, number | string>;
}
```

`fledOutcome(log?)` is what the host records when the player leaves before the end.

### Engine, strings, Screen, module

```ts
interface GameEngine<S, A> {
  initial(seed: number, party: Party, run: RunContext): S;
  reduce(state: S, action: A): S;
  outcome(state: S): Outcome | null;
  botPlay(state: S, rng: () => number): A | null;
}
type GameStrings = { en: Record<string, unknown>; fr: Record<string, unknown> };
interface GameScreenProps {
  party: Party; seed: number; run: RunContext; locale: 'en' | 'fr'; reducedMotion: boolean;
  onFinish(outcome: Outcome): void;
  onExit(): void;
}
interface GameModule<S = unknown, A = unknown> { manifest: GameManifest; engine: GameEngine<S, A>; strings: GameStrings }
function defineGame<S, A>(module: GameModule<S, A>): GameModule<S, A>;
```

Other helpers: `turnRng(seed, step)`, `FIXED_DT_MS` (50), `defineStrings({ en, fr })`, `formatText(template, params)`, `localize(text, locale)`.

### Registry (`src/games/registry.ts`)

- `listGames({ includeDev? }): GameModule[]`: sorted by category then English name; `devOnly` games only with `includeDev: true`.
- `getGame(id): GameModule | undefined` (dev-only included).
- `loadScreen(id): Promise<ComponentType<GameScreenProps>>`: the Screen's own chunk; rejects for an unknown id.
- `validateRegistry(): string[]`: problems (duplicate ids, folder not equal to id, missing Screen, Screen without manifest, bad default export, reserved folder). Empty when all is well. `checkRegistry(files, screenPaths)` is the same check on given inputs.

Discovery is `import.meta.glob('./*/manifest.ts', { eager: true })` and `import.meta.glob('./*/Screen.tsx')`. Manifests, engines and strings land in the main bundle (they are small); each Screen is its own lazy chunk.

## 4. Engine rules

1. **Pure.** Same input, same output. No `Math.random`, `Date`, `performance.now`, timers, storage, network, DOM or React. ESLint enforces this in `engine.ts`, `manifest.ts` and `strings.ts`.
2. **Seeded.** All randomness comes from `seed`. Setup: `mulberry32(fnv1a('<id>:' + seed))` from `src/game/rng`. Inside `reduce`: `turnRng(state.seed, state.step)` makes a fresh generator from numbers kept in the state. Never store a generator (a closure) in the state.
3. **Plain data.** State and actions are JSON-shaped: objects, arrays, strings, finite numbers, booleans, null. No Map, Set, Date, class instances, functions or `undefined` values (omit the key instead).
4. **Immutable.** Never mutate the state or the action. Return new objects (spread) and share untouched parts. The kit deep-freezes every state; in development `useEngine` does too.
5. **No module state.** No counters or caches at module level that change results. Two plays from the same inputs must be identical.
6. **Total.** `reduce` never throws. An invalid action, or any action once the game is over, returns the state unchanged.
7. **Outcome.** `outcome(state)` is `null` at the start and while the game runs, and the final `Outcome` once it is over (the same one every time after that). The engine writes the log in English (`strings.en`). The Screen rewrites it in the player's language with the same function (see `outcomeLog` in the sample).
8. **Real time.** Time is a `{ type: 'tick' }` action worth `FIXED_DT_MS` (50 ms) of game time. The engine counts ticks; it never reads a clock. A 3-minute game is 3,600 ticks, well inside the kit's 20,000-step budget. The `time` buff adds seconds, so `amount * 1000 / FIXED_DT_MS` ticks.
9. **Bot.** `botPlay` returns the next action of a simple, competent player, or `null` exactly when the game is over. It uses only the `rng` it is given. It must win sometimes with the full party on a plain run (the kit checks that), and it must make progress (no endless no-op actions).
10. **Difficulty.** Read `run.difficulty` (1 to 5) to scale the challenge. `roomIndex` is information only; the Arena already folds it into the difficulty.

## 5. Screen rules

1. `Screen.tsx` default-exports one component that takes `GameScreenProps` and nothing else.
2. State comes only from the engine through `useEngine(engine, props, { localize })` (`src/games/ui/useEngine.ts`). It creates the state once, ignores actions after the end, deep-freezes states in development, and calls `onFinish` **exactly once** when the outcome first becomes non-null, with `durationMs` set and the log localized.
3. Props are read once at mount. The host remounts the Screen (new `key`) for a new game or a replay.
4. After the end, keep showing the final board and a short result line. The host decides when to unmount and shows its own results panel.
5. **Leaving.** A "Leave" button calls `onExit()`. Before `onFinish`, the host records `fledOutcome()`. A game can also have its own forfeit action that ends as `fled` through the engine, like Coin Duel's Forfeit.
6. **Real time.** Use `useFixedStep(() => dispatch({ type: 'tick' }), { running: outcome === null })` (`src/games/ui/useFixedStep.ts`). It pauses when the tab is hidden and catches up at most 5 ticks per frame.
7. Every word comes from `strings[locale]`. Heading levels: the game title is an `h2`, sections are `h3` (the host owns the `h1`).
8. Shared presentational components (`src/components/SystemWindow`, `Meter`, `Icon`, ...), the global `.btn` classes and the tokens are welcome.

## 6. Party and buffs: what they mean

**The party is the player's real-life effort made visible.** Each member is a vassal the player has been levelling through real habits. A game must make that matter: higher `power` (level plus loyalty) helps, more members give more options, `habit` can map to a role (for example Move = fast piece, Study = sees further) and `traits` can grant passives. A game that is playable with any party (a solo puzzle) declares `ignoresParty: '<reason>'` in its contract test and explains in `docs/games/<id>.md` how the party still shows (who is named, who cheers).

**Buffs are the Arena lottery's rewards** and last for one run. Units: `attack`, `defense`, `luck` are percentage points (15 = +15%); `time` is seconds; `hint` and `revive` are counts. A game uses the kinds that make sense and ignores the rest. The docs page lists which ones it uses under `## Buffs`. If none make sense, declare `ignoresBuffs: '<reason>'`.

The kit checks both: `parties.full` against `parties.starter`, and `runs.buffed` (then one buff of each kind) against `runs.plain`, must change at least one game out of five seeds.

## 7. Boundaries (ESLint)

`eslint.config.js` enforces, for `src/games/**`:

| Rule | Where | Why |
| --- | --- | --- |
| No `**/state/**`, `**/screens/**`, `zustand`, `react-router-dom` | all of `src/games` | "mini games never touch the Haven store; talk through GameScreenProps" |
| No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB` | non-test files | offline and stateless; the host persists outcomes |
| No `react`, `Math.random`, `Date.now`, `new Date()`, `performance.now` | `engine.ts`, `manifest.ts`, `strings.ts` | pure, seeded, eager-loaded |
| No `../testing/contract` | non-test files | the kit imports vitest |
| Router allowed | `src/games/lab/**` only | the Lab is a dev tool with routes; still no store |

Allowed: `src/components/**`, `src/utils/**`, `src/game/rng`, `src/game/types`, `src/game/content`, other pure modules of `src/game`, and `src/games/contract.ts`, `ui/`, `testing/fixtures` and `testing/play`. `src/games/lint.test.ts` lints snippets with the real config and proves each rule fires. For example, this line in `src/games/<id>/Screen.tsx`:

```ts
import { useGameStore } from '../../state/gameStore';
// error  '../../state/gameStore' import is restricted from being used by a pattern.
//        mini games never touch the Haven store; talk through GameScreenProps  no-restricted-imports
```

Code that must touch the store (the Arena's host, which applies outcomes to the save) lives **outside** `src/games/`, for example in `src/screens/arena/`.

## 8. Accessibility and responsive

- Follow `docs/RESPONSIVE-RULES.md`: grids `minmax(0, 1fr)`, `flex: none` on fixed-size children, no fixed px heights on content, breakpoints at `max-width: 359px`, `min-width: 768px` and `max-height: 500px`, sizes in `rem`, tokens only.
- Tap targets of at least 44x44 px. Text at least 14 px, the pixel font at least 9 px.
- Playable by **touch and keyboard**. Every control is a real `<button>` (or input) with an accessible name. Shortcuts are a bonus, never the only way, and are ignored while focus is in a text field.
- Announce what changed (a result line in an `aria-live="polite"` region). Never use colour as the only signal.
- `reducedMotion` turns animation and movement off; the layout stays identical and the game stays winnable.
- A canvas game gives the canvas a text alternative and mirrors the essential state in text.
- The e2e spec runs axe through the Lab (no serious or critical violation) and `expectResponsiveGame` (no horizontal overflow and 44 px controls at 320x568 and 844x390).

## 9. Offline

No network, ever: no fetch, no CDN fonts or images, no analytics, no remote models. Assets live in the game folder and are bundled (the PWA precaches them). "AI" games run their logic on the device in the engine. Nothing is stored by the game. The host stores outcomes.

## 10. Size budgets

| What | Budget | Checked by |
| --- | --- | --- |
| The game's own code: manifest, engine, strings, Screen, CSS, minified, before gzip | **150 KB** | `src/games/budget.test.ts` via `node scripts/games-budget.mjs` |
| Assets in the game folder | **200 KB** | same |
| Screenshots in `docs/games/img/` | about 150 KB per game | review (the PR budget is 0.5 MB of images) |

Shared code (React, `src/components`, `src/game`, `src/games/*.ts`) is not counted. The Screen is lazy: it loads when the game is opened. The engine and strings ship in the main bundle, so keep them lean (move big tables to the Screen side or compute them). Never raise a budget to make a test pass.

## 11. The test kit

`src/games/testing/`:

- `fixtures.ts`: `parties.full` (the 8 vassals, level 12, loyalty 80, power 44, some titles), `parties.starter` (3 vassals, level 1, power 8), `parties.single` (1 vassal, level 5); `runs.plain` (difficulty 2, no buffs), `runs.buffed` (attack 15, time 20, hint 2), `runs.hard` (room 4, difficulty 5). All deep-frozen.
- `play.ts`: `playToEnd(module, seed, party, run, maxSteps = 20000)` returns `{ state, outcome, steps, actions, stopped? }`. Also `deepFreeze` and `botRng`. No vitest, so the Lab uses it too.
- `checks.ts`: every check as a plain function that throws `ContractViolation` (with `.problems`).
- `contract.ts`: `describeGameContract(module, options)` registers one vitest test per check, and re-exports everything above.

`ContractOptions`: `folder` (the id must equal it; pass `folderOf(import.meta.url)`), `maxSteps` (20,000), `seeds` (`DEFAULT_SEEDS`: 1, 7, 42, 1337, 90210), `ignoresBuffs` and `ignoresParty` (a reason of at least 10 characters), `timeoutMs` (60,000 for the slow checks).

| Test | Check function | Passes when |
| --- | --- | --- |
| manifest | `checkManifest(module, folder?)` | every field valid (section 3), no unknown field, engine has its four functions |
| strings | `checkStrings` | same key tree in en and fr, leaves are non-empty strings or arrays of them, same `{placeholders}` per key |
| determinism | `checkDeterminism` | `initial` twice is equal; two bot plays from the same seed, party and run have identical actions, final states and outcomes |
| termination | `checkTermination` | for 5 seeds with every party (full, starter, single when `min` is 1) on `runs.plain`, plus full on `buffed` and `hard`: `outcome(initial)` is null, the game ends within `maxSteps`, `botPlay` is null exactly at the end, an action after the end changes nothing |
| purity | `checkPurity` | plays on deep-frozen states and actions do not throw, equal a normal play, and every state and action is plain data |
| outcomes | `checkOutcomes` | every outcome valid (section 3), troops are ids of the fitted party |
| seeds | `checkSeedsDiffer` | at least 3 of the 5 seeds give different games (actions and outcome, not just a stored seed) |
| buffs | `checkBuffsHonoured` | `runs.buffed`, or one buff of any kind, changes at least one game; or `ignoresBuffs` |
| party | `checkPartyHonoured` | `parties.full` and `parties.starter` differ on at least one seed; or `ignoresParty` |
| bot | `checkBotWins` | the bot wins at least once with `parties.full` on `runs.plain` |

`honouredBuffKinds(module)` lists the buff kinds that change the game (for your docs page). The bot's own PRNG does not depend on the seed, so a difference between seeds is always the game's. The kit tests itself in `src/games/testing/checks.test.ts` against broken fakes: non-deterministic, mutating, a Map in the state, non-terminating, a stuck bot, over at start, reopening after the end, a bad manifest, mismatched strings, bad outcomes, an ignored seed, ignored buffs, an ignored party, a bot that never wins.

Also automatic for every game folder, with no edit needed: `src/games/registry.test.ts` (layout, docs, e2e file, registry problems) and `src/games/budget.test.ts` (sizes).

## 12. Games Lab

A dev tool at `#/lab` (every game, dev-only ones included, with category filter chips) and `#/lab/<id>` (plays one game). It is open in dev builds, or in any build when `localStorage['haven.debug'] === '1'` (the e2e helpers set it); otherwise `#/lab` redirects to `#/`. It never reads or writes the save.

Everything lives in the URL: `#/lab/<id>?seed=42&lang=fr&party=starter&run=buffed&rm=1`. `seed` is added if missing; `lang` defaults to `navigator.language`; `rm` to the OS setting. Controls: seed (Apply, New seed), language, starter party, buffed run, reduced motion. The **Outcome** panel shows result, score, troops, duration, stats, log and learned note. **Replay same seed** remounts the game and says whether the new outcome "Matches the previous run". **Bot play** plays the engine headlessly to the end. A Screen that crashes is shown in a red panel instead of taking the Lab down.

e2e helpers in `e2e/games/lab-helpers.ts`: `openLab(page, id?, options)`, `labPath`, `readOutcome`, `outcomePanel`, `expectNoSeriousA11yViolations`, `expectResponsiveGame`, `shootGame(page, testInfo, id, name)` (writes `docs/games/img/<id>-<name>.png`, mobile project only).

## 13. Recipe: add a game in ten steps

1. **Pick the id** (kebab-case, for example `roguelike-chess`) and read your brief, this page and `src/games/sample/` end to end.
2. **Copy the template:** `cp -r src/games/sample src/games/<id>`, `cp docs/games/sample.md docs/games/<id>.md`, `cp e2e/games/sample.spec.ts e2e/games/<id>.spec.ts`. Delete `Screen.test.tsx` only if you will write your own.
3. **Manifest:** set `id` to the folder name, names and taglines in both languages, category, `minRing`, `rosterSize`, `estMinutes`, `learning` if relevant. Remove `devOnly` (the sample is the only dev-only game) unless your brief says otherwise.
4. **Strings:** write every word in `strings.ts`, English and French, with `defineStrings`. Keep `{placeholders}` identical in both.
5. **Engine:** define plain-data `State` and `Action` types, then write `initial`, `reduce`, `outcome` and `botPlay` following section 4. Use the party and the buffs (section 6).
6. **Engine tests:** in `engine.test.ts`, one test per rule of your brief. Use `parties`, `runs` and `playToEnd` from `../testing/contract`.
7. **Contract test:** keep `contract.test.ts` exactly as copied. Run `npx vitest run src/games/<id>` and fix every failing check.
8. **Screen:** build the UI with `useEngine` (and `useFixedStep` for real time), touch plus keyboard, `reducedMotion`, tokens, the responsive rules. Try it at `npm run dev` then `http://localhost:5173/#/lab/<id>`.
9. **e2e and docs:** adapt `e2e/games/<id>.spec.ts` (play to an outcome through the Lab, keyboard path, `expectResponsiveGame`, `shootGame`), then run `npx playwright test e2e/games/<id>.spec.ts --workers=2`. Write `docs/games/<id>.md`: rules, controls, `## Party`, `## Buffs`, determinism, bot, the screenshots.
10. **Check and ship:** `npm run lint && npm run typecheck && npm test && npm run build`, then `node scripts/games-budget.mjs`. Open the PR with the test counts and the screenshots. You edited only `src/games/<id>/`, `e2e/games/<id>.spec.ts` and `docs/games/<id>*`.

### Checklist

- [ ] `src/games/<id>/` has the seven layout files; the id equals the folder
- [ ] `npx vitest run src/games` green: contract (10 tests), registry layout, budget, your engine tests
- [ ] No `Math.random`, clock, storage, network, store or router; lint is clean
- [ ] Party and buffs change the game, or the contract test declares why not and the docs say so
- [ ] Playable by touch and keyboard, reduced motion honoured, every word in en and fr
- [ ] e2e spec green on both projects; axe clean; 320x568 and 844x390 checked; screenshots looked at
- [ ] Code at most 150 KB, assets at most 200 KB

## 14. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `determinism: initial() differs between two calls` | Randomness outside the seed: `Math.random`, `Date`, or a module-level counter. Derive everything from `seed`. |
| `determinism: two plays differ at actions[...]` | `reduce` or `botPlay` reads hidden state, or the bot uses `Math.random` instead of its `rng`. |
| `purity: threw on a deep-frozen state, so it mutates its input` | A `push`, `splice`, `sort`, `x.y = ...` or `++` on the state or the action. Copy first: `[...arr, x]`, `[...arr].sort()`, `{ ...obj, y }`. |
| `purity: ... is a Map instance` / `is a function` | State must be plain data. Use objects and arrays; keep the seed and a step counter and call `turnRng(seed, step)`. |
| `termination: no outcome after 20000 steps` | The bot makes no progress (a no-op action), or the game has no end condition. Real time: check that ticks advance the clock and that the game has a time limit. |
| `termination: botPlay returned null ... while outcome(state) is still null` | The bot returns `null` only when `outcome(state)` is non-null. |
| `termination: an action after the end changed the outcome` | Start `reduce` with `if (engine.outcome(state)) return state;` (or your `isOver`). |
| `outcomes: score ... must be an integer` | Wrap it: `score: clampScore(raw)`. |
| `outcomes: troopsUsed has "x", which is not in the party` | Use the ids of the members you received, after `fitParty` (the first `rosterSize.max`). |
| `seeds: only 1 distinct games` | The seed is stored but not used. Feed it to the setup generator and to `turnRng`. |
| `buffs: no buff changed any of the 5 games` | Read `buffAmount(run, kind)`. If the game truly has nothing to buff, declare `ignoresBuffs: 'reason'` and document it. |
| `party: ... played identically` | Use `power`, the members or their habits. Or declare `ignoresParty: 'reason'` and document how the party shows. |
| `bot: the bot never won` | Make `botPlay` greedier (best odds, best move), or the game too hard at difficulty 2. |
| `strings: en.x is missing in French` / `placeholders differ` | Add the key in `fr`; keep `{name}` spelled the same in both. |
| `manifest: id "x" must equal its folder name` | Rename the folder or the id; they must match exactly. |
| `registry: ... Screen.tsx is missing` / layout test fails | A required file is missing or misnamed (case matters: `Screen.tsx`, `Screen.module.css`). |
| ESLint `mini games never touch the Haven store` | You imported state, screens, zustand or the router. Everything a game needs comes in `GameScreenProps`. |
| The Lab shows "No game" | Missing or invalid default export in `manifest.ts`, or the id and the folder differ. `window.__haven.games()` lists the ids and the registry problems. |
| The Lab shows "The game crashed" | The Screen threw; the message is shown. In development, states are frozen, so a Screen-side mutation throws here. |
| `onFinish` called twice / not at all | Use `useEngine`; do not call `onFinish` yourself. |
| Budget test fails | Move big data out of the engine, share helpers from `src/game`, shrink images (palette PNG, SVG). Never raise the budget. |
| `#/lab` redirects to the Haven | Production build without the flag: set `localStorage.setItem('haven.debug', '1')`, or use `npm run dev`. |
