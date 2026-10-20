# Notes: Still Water (`game-still-water`)

Decisions taken while unattended. Nobody was available to confirm them.

## Rhythm table

The brief says difficulty 1 is 4-2-6, then “shifting to 5-3-7 and faster patterns”. I treated 5-3-7 as difficulty 2 (a longer, slightly harder hold) and made 3–5 faster and shorter so a full game stays under two minutes.

| Difficulty | Inhale | Hold | Exhale | Cycles | Base grace | Bot late | Gust chance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 4 s | 2 s | 6 s | 5 | 8 ticks | 2 ticks | 8 % |
| 2 | 5 s | 3 s | 7 s | 6 | 6 ticks | 8 ticks | 22 % |
| 3 | 4 s | 2 s | 5 s | 6 | 5 ticks | 12 ticks | 30 % |
| 4 | 3 s | 2 s | 4 s | 7 | 3 ticks | 16 ticks | 36 % |
| 5 | 3 s | 1 s | 3.5 s | 8 | 2 ticks | 22 ticks | 42 % |

One tick is `FIXED_DT_MS` (50 ms). Total length is about 60–90 seconds before the Move stretch.

## Scoring

Accuracy is the Jaccard overlap of the player’s hold with the ideal hold (inhale + peak), not “agree on every tick”. Agree-on-every-tick would score a never-held or always-held run around 50 percent, which made the 60 percent win line meaningless.

- Grace ticks around each phase boundary are ignored (Sleep power and the `time` buff widen that window).
- Cycle accuracy is `floor(100 * matchedHold / union)` , or 100 if the union is empty.
- A cycle under 50 percent can be forgiven once by `revive` (counted as 70 percent, “the pond held the missed breath”).
- Final score: `clampScore(averageAccuracy * 10 + steadiness * 8 + (hint ? 10 : 0) - (100 - calm))`.
- Won at 600 or more; otherwise `lost` with the brief’s warm line. Forfeit is `fled`.

Calm starts at 100; tapping a decoy costs 15. Ignoring a decoy adds 1 to steadiness. Water level is the running average of cycle accuracies; it is never a failure state.

## Party and buffs

- **Sleep** (habit `sleep`): `floor(power / 8)` extra grace ticks. “Rest helps.”
- **Eat** (habit `eat`): turns the ideal-timing guide on (`showHint`) and the +10 hint bonus.
- **Move** (habit `move`): `floor(power / 10)` extra ticks on every phase (the rhythm lengthens so the body can take its time). This is the “adjustable” reading: the engine adapts the pattern; there is no mid-run pace picker, to keep the input list as `hold` / `tap`.
- `time`: +1 grace tick per second of buff.
- `hint`: same guide as Eat.
- `revive`: one forgiven cycle (see above).
- `luck`: drops one planned decoy (the last one).
- `attack` and `defense` are ignored: there is no combat.

Every party member is listed in `troopsUsed` (they sat by the pond). Playable with `parties.starter` and with a citizen (`habit: null`).

## Input and accessibility

Actions are `{ type: 'tick' }`, `{ type: 'hold', down }`, `{ type: 'tap', decoyId }`, `{ type: 'forfeit' }`.

The Screen keeps two optional modes, both default off, both reset every game (nothing is stored):

- **Tap each phase**: one press sets hold for inhale/peak and release for exhale. Kept because the cut line drops vibration first, then this mode, then decoys.
- **Vibration**: `navigator.vibrate` on phase change, guarded, default off.

Reduced motion replaces the expanding ring with a progress bar and the same text cue (`breathe in` / `hold` / `breathe out`) in an `aria-live` region. Keyboard: Space and Enter hold (or tap a phase); every control is a real button.

No sound. The practice disclaimer is on screen and in the docs.

## Seed and bot

Setup RNG is `mulberry32(fnv1a('still-water:' + seed))`. It places gust cycles (the bot sits those out) and decoys after the first two cycles. That is how different seeds produce different actions and logs.

The bot holds late by a difficulty-dependent number of ticks and skips gust cycles. It never taps a decoy. It does not forfeit.

## Cut line

Nothing was cut. Vibration, tap-each-phase and decoys are all in.

## Files I do not own

None needed.

## Pull request

`ManagePullRequest` is not in this subagent's Cursor tool catalog. `gh pr create` returns `Resource not accessible by integration` (the CLI is read-only here). The branch `feat/game-still-water` is pushed. The parent (or a later turn with the PR tool) should open:

- title: `feat(games): Still Water [game-still-water]`
- base: `integration/arena`
- draft first, then ready once CI is green (acceptance already passes locally)

Do not merge. Do not push to `main` or `integration/arena`.

## Lab Bot play and `replaySameSeed`

The Lab's **Bot play** button stores the current result as `previous` and then writes the new one. After **Replay same seed** the current result is `null`, so the next Bot play stores `null` as previous and `lab-compare` never appears. I do not own `src/games/lab/`. Decision: the required replay spec uses `replaySameSeed` with **Step away** (the engine forfeit), which remounts cleanly and matches. Full-game determinism is covered by Bot play in the other spec and by the contract kit.

## Open questions for the reviewer

None that block shipping. The 5-3-7-then-faster table is the one judgement I would revisit if a designer prefers 5-3-7 at a higher difficulty instead of 2.
