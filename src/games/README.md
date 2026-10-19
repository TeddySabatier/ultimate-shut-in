# src/games

Mini games that plug into the Arena. The full contract is `docs/design/games/CONTRACT.md`: read it before writing a game.

| Path | What |
| --- | --- |
| `contract.ts` | The types (`GameModule`, `GameManifest`, `GameEngine`, `Party`, `RunContext`, `Outcome`, `GameScreenProps`, ...) and tiny pure helpers (`defineGame`, `defineStrings`, `buffAmount`, `emptyRun`, `fitParty`, `derivePower`, `turnRng`, `clampScore`, `formatText`, `fledOutcome`). |
| `registry.ts` | Finds every `./<id>/manifest.ts` (eager) and `./<id>/Screen.tsx` (lazy) with `import.meta.glob`: `listGames`, `getGame`, `loadScreen`, `validateRegistry`. No shared edit to add a game. **Lazy:** import it only from lazily loaded routes (the Lab, the Arena host). ESLint forbids it in `App.tsx`, `main.tsx`, `state/`, and `components/` outside `components/arena/`. |
| `ui/` | Hooks for Screens: `useEngine` (state, dispatch, one `onFinish`), `useFixedStep` (real-time ticks), `useCanvas` (a canvas sized by the pixel ratio). `RealtimeExample.tsx` is the runnable real-time pattern. |
| `testing/` | `fixtures.ts` (`parties`, `runs`), `play.ts` (`playToEnd`), `validate.ts` (`outcomeProblems`), `checks.ts` (the contract checks), `contract.ts` (`describeGameContract`, test files only). |
| `lab/` | The Games Lab at `#/lab` (dev builds, or `localStorage['haven.debug'] = '1'`). |
| `sample/` | Coin Duel, the reference game (dev-only). **Copy it to start a game.** |
| `host/` | Reserved and empty. The Arena host lives in `src/components/arena/host/`, because it uses the store and `src/games/` may not. |
| `<id>/` | One folder per game: `manifest.ts`, `engine.ts`, `strings.ts`, `Screen.tsx`, `Screen.module.css`, `engine.test.ts`, `contract.test.ts`. |

Rules in one breath: the engine is pure, seeded and plain data; the Screen plays it through `useEngine` and talks to the app only through `GameScreenProps`; no store, router, storage or network (ESLint enforces it); every word in English and French; touch, keyboard and reduced motion; code at most 150 KB, assets at most 200 KB.

Besides the folder, every game has `e2e/games/<id>.spec.ts` (three required tests through the Lab, each under about 20 s), `docs/games/<id>.md` (with `## Party` and `## Buffs`) and at most three screenshots `docs/games/img/<id>-*.png` (150 KB in total, from `shootGame`).

Checks that cover every game automatically: `registry.test.ts` (layout, docs, e2e spec), `budget.test.ts` (sizes), `lint.test.ts` (the ESLint boundaries), each game's own `contract.test.ts`, and `node scripts/check-main-chunk.mjs` in CI (no game in the main chunk).
