# Notes: Decision Dungeon (`game-decision-dungeon`)

Base: `integration/arena`. Branch: `feat/game-decision-dungeon`. Files owned: `src/games/decision-dungeon/**`, `e2e/games/decision-dungeon.spec.ts`, `docs/games/decision-dungeon.md`, `docs/games/img/decision-dungeon-*.png`, this file.

## Decisions (nobody was available)

1. **Keep the full 18+18 scenarios**, plus sleep-on-it and the variety bonus. Content is the work of this brief; the cut line is only if time runs out.
2. **English and French share structure, not wording.** Same ids `s01`–`s18`, same mood, topic, ease, option count and style tags. The French situations are original scenes (tutoiement), not sentence-by-sentence translations.
3. **Difficulty.** Room count is 5 / 5 / 6 / 6 / 7 at difficulties 1–5. Easier scenarios are drawn first, with mood variety. Difficulty 1–2 shows a short `cue` on each option (clearer wording). Difficulty 3–5 hides the cue.
4. **Party.** Habit perks, not raw combat: Social reveals one option's style tag per room (two tags when that member's power is 20 or more). Sleep unlocks one "sleep on it" peek of a reflection per run. Study shows the room's reframing question. The first matching member of each habit is the one recorded in `troopsUsed`. Starter party (move / outside / clean) has none of these and stays playable.
5. **Buffs.** `hint` is an action that reveals another tag (so `runs.buffed` changes the bot's action list). `revive` lets the player (and a bot that just picked a non-good style) re-pick the current room. `luck` ranks ease-3 rooms last and salts door order (`turnRng` step + 17). `attack`, `defense` and `time` are ignored: there is no combat and no timer.
6. **Scoring.** Integer only: `good` = constructive + boundary choices. Win when `good * 5 >= rooms * 3` (60 percent or better). Score = `floor(800 * good / rooms) + 40 * distinctStyles`, clamped 0–1000. Forfeit is `fled` with the partial score from rooms already answered.
7. **Bot.** Peeks when Sleep is present, spends hints, undoes a non-good choice when a revive remains, and otherwise picks a constructive door. The Lab's `playToEnd` always starts the bot rng from the same salt, so the bot mixes `rng` with `state.seed` and `roomIndex` or every seed would share one unlucky stream. Tuned so a full party on a plain run wins in the 40–70 percent band (unit test over 40 seeds).
8. **Not therapy.** Docs and a one-line note on the Screen. Help line is generic ("talk to someone you trust or a professional"); no phone numbers.
9. **Draft PR.** `ManagePullRequest` is not in this run's tool catalog. `gh pr create` and `POST /repos/.../pulls` both returned `403 Resource not accessible by integration`. The branch is pushed: `feat/game-decision-dungeon`. Please open the draft PR from that branch with **base `integration/arena`**, title `feat(games): Decision Dungeon [game-decision-dungeon]`. I did not merge, retarget, or push to `main` / `integration/arena`.
10. **Same-branch collision.** Another agent also pushed a 10-scenario Decision Dungeon onto `feat/game-decision-dungeon` (nested `content/*.ts`, cut-line size, no `Screen.test.tsx`). I merged that history and kept this 18-room flat implementation: the brief prefers 18 rooms, and game TypeScript files must stay flat so the cross-game import lint does not fire.

## Files needed that I do not own

None. The missing PR tool is the only blocker that is not in this brief's files.

## Verification

```
npm run lint        clean
npm run typecheck   clean
npm test            829 passed (62 files); Decision Dungeon 40 unit tests
npm run build       ok
node scripts/check-main-chunk.mjs   ok (decision-dungeon not in main chunk)
node scripts/games-budget.mjs       decision-dungeon code 71.2 KB / 150 KB
npx playwright test e2e/games/decision-dungeon.spec.ts --workers=2
                    11 passed, 1 skipped (axe desktop), both projects
```

Screenshots (mobile `shootGame`, 37.2 KB total): `docs/games/img/decision-dungeon-start.png`, `docs/games/img/decision-dungeon-end.png`. Viewed: start shows cues, Social tags and Sleep peeks; end shows the last reflection and a won banner. Responsive spec checked 320x568 and 844x390.

## Suggested PR body

Use `.github/pull_request_template.md` with:

- Brief id: `game-decision-dungeon`, `docs/briefs/games/decision-dungeon.md`
- Wave: overnight / integration/arena
- Base: `integration/arena`, stacked: no
- Files outside the list: none
- Save version: unchanged
