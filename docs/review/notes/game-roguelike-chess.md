# Notes: Roguelike Chess (`game-roguelike-chess`)

Decisions taken unattended. Nothing here needs a shared-file edit.

## Decision on the earlier Cursor build

An unreviewed build sits on `origin/feat/game-roguelike-chess` (4 commits, 8 files, no PR). It was evaluated read-only (`git diff --stat`, `git show`), then its `src/games/roguelike-chess` folder was **adopted** into this branch with `git checkout origin/feat/game-roguelike-chess -- src/games/roguelike-chess` (the branch itself was never merged). The adoption test: `npx vitest run src/games` passed for this game (contract kit, lint rules, size budget and its 39 engine tests); the only failures were the then-missing docs page and e2e spec, which are mine to write, and two timeouts in other games' long tests under load. The engine matched the brief's structure: habit-to-piece map, capture rule, ten monsters, 12 upgrades, eight named passives, three rooms, turn cap, score, forfeit.

**Kept** (the structure and most of the code): the pure engine and its state shape, the 12 upgrades, the 8 passives and their title mapping, the locked-intention enemy model, the strings (en and fr) and the greedy bot, plus its 39 engine tests and 3 Screen tests.

**Changed or added by this build** (found by playing it):
- **Dust Bunny bug:** a bunny split every turn, so the room could not be cleared and the bot lost 20 to 30 percent of games to the turn cap. A bunny now leaves one copy only (new `kids` field); the copy cannot split. The bot then won 100 percent at difficulty 3, so the whole difficulty curve was re-tuned.
- **Balance:** a level 1 starter party could not win even difficulty 1 (0 percent). Attack is now `1 + floor((level + 2) / 3)`; monster HP and attack come from per-difficulty tables, and monsters toughen with the party's average level (`tough`). Starter wins d1 87 percent, full party d3 60 percent (200 seeds), d4 49, d5 16. All numbers are in `docs/games/roguelike-chess.md`.
- **Knight reach:** the +1 range upgrade gave a knight odd extra jumps; it now gives king steps only.
- **Screen rebuilt:** pieces and monsters are SVG silhouettes (the first build drew letters), a health bar and number on each square, intent marks with a verb symbol and a dashed outline on threatened pieces, a Wave list that says in words what each monster will do, a three-line log, and a summary under the result banner. Roving keyboard focus: the arrow keys move real focus over the cells; Enter on any other button keeps its meaning (the first build swallowed Enter on Forfeit).
- **Tests:** 6 engine tests (balance, bunny, reach, mixed party), 4 Screen tests (keyboard, Enter not stolen, wave list, upgrade flow), and a new e2e spec that plays a whole room through the real UI by mirroring the engine.

The maintainer should **close `origin/feat/game-roguelike-chess` after this PR merges** (it is superseded; it was never a PR).

## Name

English **Roguelike Chess**, French **Échecs vagabonds**. The party are the pieces, the wave monsters are the opposition, the room-3 boss is the Static.

## Design decisions

- A capture that does not kill leaves the attacker where it was (the blow "bounces"); the same rule for monsters. This keeps pieces from diving in and keeps every square readable.
- Monsters follow the intention locked and shown at the start of the player's turn, they do not re-plan. This is the "puzzle, not a surprise" the brief asks for; the drawback (a monster can waste a move) is listed in the doc.
- Monsters toughen with the party's average level so difficulty 1 is gentle for a new player (three level 1 vassals) and a maxed party still has a fight. The party still matters: level 12 pieces have about four times the HP and three times the attack.
- Turn cap 40 per room, as in the brief; the `time` buff gives +1 turn per 5 seconds.

## Cut line

Cut: the optional stretch "Show how the enemy thinks" (the intention marks and the Wave list already show the scripted rule, and a third panel would crowd 320 px). Kept: all 12 upgrades, all 8 passives, all 9 monsters plus the Static.

## Files not owned

None needed. `src/games/roguelike-chess/**` (a `Glyphs.tsx` for the SVG art next to the usual seven files), its e2e spec, its doc, two screenshots and this notes file.

## Observations about shared code (not edited)

- `e2e/games/lab-helpers.ts` `replaySameSeed` cannot be used with the Lab's Bot play (Bot play replaces the previous outcome); `replaySameSeedWithBot` does the job and is used here.
- A game spec cannot import `src/games/testing/fixtures.ts` (it reads JSON, which plain Node ESM rejects), so the spec rebuilds the "full" party locally to mirror the engine. A pure `parties` module without the vassal names would let specs reuse it.
