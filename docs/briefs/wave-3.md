# Wave 3 briefs (not startable yet)

This brief depends on wave 2 PRs being **merged into `main`**. Do not start them, and do not stack on an unmerged wave 2 branch. The maintainer expands each into a full brief file (same format as `E` to `L`) when its prerequisites merge.

| ID | Brief | Starts when | Reserved save version | Size |
| --- | --- | --- | --- | --- |
| M | i18n wiring | brief E merged, and every UI PR of wave 2 and of the overnight program merged or parked | next free (none expected) | large, touches every screen |

## M: i18n wiring (must run alone)

Replace every hard-coded UI string with `t()` using the harvest in `src/i18n/ui.*.json` and the plan in `docs/I18N.md` (brief E). Add the language setting to Settings (English, Francais, follow the browser), persisted under `haven.locale`. Turn the catalog parity check from a warning into a failure and translate every key added after brief E merged, including the `notes`, `recap`, `polish`, `citizens` and `arena` keys. Proposal reasons are stored as English text today: store a key plus parameters instead and migrate old ones. Localise dates, numbers and the pluralised counters, set `<html lang>`, and make the compose parser use the app locale first.

**Freeze rule.** While M is open, no other UI PR merges. M touches every screen, so it is the one brief allowed to conflict with everyone; that is why it runs alone and after the others. Everyone who merges after M adds strings through `t()` and adds the French at the same time. Wave 2 UI briefs already keep every string in `strings.json` under their own key, which is what makes M mechanical.

Roguelike Chess is no longer a wave 3 item: it is one of the eleven mini games of the overnight program (`docs/OVERNIGHT.md`, brief `docs/briefs/games/roguelike-chess.md`).
