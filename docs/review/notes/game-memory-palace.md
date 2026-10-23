# Notes: Memory Palace (`game-memory-palace`)

Brief: `docs/briefs/games/memory-palace.md`. PR: #36 on `integration/arena`. Nobody was available to ask, so every decision is written here.

## The Cursor build: adopted, then reworked

A Cursor agent had pushed an unreviewed build to `origin/feat/game-memory-palace` (never tested, no PR). It was adopted with `git checkout origin/feat/game-memory-palace -- <files>` (the branch was not merged) after `npx vitest run src/games` passed with it, including the contract kit, lint and budget tests. It matched the brief's rules, so it was kept as the baseline and then reviewed. Kept: the engine skeleton, the 150-word lists with confusable groups, the seeded picker, the scoring shape, the revive logic and the contract test wiring. Changed:

- Look times were 1.2 s down to 0.4 s per thing (24 to 8 ticks of 50 ms): unplayable for a human. Now 8 s down to 3 s, never under 2 s.
- Added a ready card before every round, so the first look does not start under the player's thumb.
- Things now appear in walking order (gate to tower), so the route is the technique; the recall order stays free.
- French prompts used a bare noun after "Imagine" ("Imagine gland dans le hall"). Prompts are now a label plus a caption about "l'image" that no gender agrees with.
- Technique tips (six, en and fr): Social shows the tip of the round, and the `learned` note carries one (Cursor put an item prompt there).
- The bot now spends hints only on things it forgot, a hint rescues most but not all of them, a longer look lowers its error, a revive gives a better second walk. Before, the full party and the starter party won identically (the hints did nothing for the bot).
- Score: the 150-point no-hint bonus is scaled by the share correct, so an empty recall scores 0 (it scored 150).
- Screen rewritten: a scene card for the thing being looked at, a route map with the current room marked, richer SVG scenes, items and rooms picked in either order, all hints of the round kept on screen, placed things listed in their room with a symbol and a hidden "(right/missed)" label, arrows, Home and End walking the rooms, focus kept on the next action, no duplicate live text.
- The pointer-based drag (it also fired on plain taps) was dropped; HTML drag and drop stays as an extra.
- Tests: 67 unit tests (engine, technique, Screen) plus the contract kit; the e2e spec plays a whole game through the real UI by mirroring the engine, replays through Bot play (`replaySameSeedWithBot`, which avoids the Lab quirk Cursor worked around), and checks keyboard, French, difficulty, perks, responsive sizes and reduced motion.

The Cursor branches `origin/feat/game-memory-palace` and `origin/cursor/game-memory-palace-d0f9` should be closed by the maintainer after this PR merges.

## Decisions

- **Hint shape.** The brief says a hint reveals the first letter of a forgotten item. In recall the item words are already on screen, so a bare letter helps nobody. A hint names the room and the first letters ("In the kitchen, something starts with L"): the place cues the thing, the method in reverse. Study power 40 or more reveals two letters.
- **Time buff.** CONTRACT.md says a `time` buff adds `amount` seconds on a global clock. A look is timed per thing, so 20 s on each of 24 looks would be absurd. Each buff second adds 4 ticks (0.2 s) to every look, capped at 120 ticks (6 s).
- **Sleep.** Adds `floor(power / 2)` ticks to each look.
- **Bot targets.** The brief wants 40 to 70 percent wins on normal difficulty. With the full party on the plain run (difficulty 2) over 100 seeds the bot wins 68; difficulty 3 wins 53; difficulty 1 wins 100; difficulty 5 wins 6. The starter party wins 31 at difficulty 2.
- **Distractors.** The items grid holds the things plus distractors; placing a distractor wastes a slot and is a miss, told in words ("never in the palace").
- **A wrong placement does not reveal the right room**, so a player cannot learn the answer by trial and error; a wrong item is spent.
- **Cut line.** Nothing was cut: round 3, generated captions and drag all ship. Drag works with a mouse only (HTML drag events); touch uses taps.

## Files not owned

None needed. A scratch file `stats.txt` was committed by mistake earlier on this branch and removed again in the same PR, so the final diff does not contain it.
