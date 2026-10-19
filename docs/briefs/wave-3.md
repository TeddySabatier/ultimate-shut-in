# Wave 3 briefs (not startable yet)

These four depend on wave 2 PRs being **merged into `main`**. Do not start them, and do not stack on an unmerged wave 2 branch. The maintainer expands each into a full brief file (same format as `E` to `L`) when its prerequisites merge; until then the design documents named below are the specification.

| ID | Brief | Starts when | Reserved save version | Size |
| --- | --- | --- | --- | --- |
| M | i18n wiring | brief E merged, and every wave 2 UI PR (H, J, L) merged or parked | next free after the merged ones (none expected) | large, touches every screen |
| N | Citizens build | brief F merged, and M merged | **v6** | large |
| O | Arena build: Armory, runs, lottery, request flow, plug-in host | brief G merged, and N merged (citizens join the roster) | **v7** | large |
| P | Roguelike Chess, the first plug-in game | brief O merged | none (game state lives in the run) | medium |

## M: i18n wiring (must run alone)

Replace every hard-coded UI string with `t()` using the harvest in `src/i18n/ui.*.json` and the plan in `docs/I18N.md` (brief E). Add the language setting to Settings (English, Français, follow the browser), persisted under `haven.locale`. Turn the catalog parity check from a warning into a failure, and translate every key that was added after brief E merged. Proposal reasons are stored as English text today: store a key plus parameters instead and migrate old ones. Localise dates, numbers and the pluralised counters, set `<html lang>`, and make the compose parser use the app locale first.

**Freeze rule.** While M is open, no other UI PR merges. M touches every screen, so it is the one brief that is allowed to conflict with everyone; that is why it runs alone, quickly, after the others are in. Everyone who merges after M adds strings through `t()` and adds the French at the same time.

## N: Citizens build

Spec: `docs/design/CITIZENS.md` and its prototype (brief F). Engine first (`src/game/citizens.ts`, content `citizens.json`, tick integration, wave and defense hooks, save version 6 with migration and tests), then the Residents panel on the Haven screen and the detail window, then e2e and responsive coverage. Strings go through `t()` with French.

## O: Arena build

Spec: `docs/design/ARENA.md`, `docs/design/games/CONTRACT.md` (brief G). Engine first (Armory, runs, lottery, banking, request log, save version 7), then the Arena screen (a sixth tab is not allowed: place it as a section reachable from the Haven screen unless the spec argues otherwise), the plug-in host under `src/games/`, then e2e and responsive coverage. The host and the contract are built here; no game ships in this brief except a trivial test game used by the contract tests.

## P: Roguelike Chess

Spec: `docs/design/games/roguelike-chess.md` (brief G). A module under `src/games/roguelike-chess/` following the contract exactly: manifest, pure seeded engine with exhaustive unit tests, screen, keyboard play, reduced motion, a replay test proving a seed reproduces a game. It is the template every later requested game will copy, so keep it clean.
