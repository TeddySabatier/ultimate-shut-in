# Game: Still Water (`still-water`)

| | |
| --- | --- |
| Category | `self-development` |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Estimated minutes | 2 |
| Priority | 8 |

## Skill practised

Sustained attention and calm pacing: following a slow breathing rhythm and resisting distractions. It is practice, **not therapy and not a medical tool**: say so in the docs and in a one-line note in the game.

## Idea

A still pond. A soft ring expands and contracts slowly (inhale, hold, exhale). The player matches it: **hold the button (or space) while the ring grows, release while it shrinks**, in time. Small "ripples" (distractions: a drifting leaf, a fish, a flickering light) pass by; they must be ignored, not tapped. Calm, short, forgiving.

## Rules

- Rhythm 4 seconds in, 2 hold, 6 out for difficulty 1, shifting to 5-3-7 and faster patterns by difficulty; 5 to 8 cycles. Accuracy is the overlap between the player's hold and the ideal, scored per cycle; the pond water level shows a smooth running score, never a failure state.
- Distraction events appear only after the first two cycles; tapping a decoy costs a small amount of calm; ignoring it adds to a "steadiness" counter. Never a loud sound; no sound at all unless the page already has user interaction and a setting exists (sound off is the default and may simply be absent).
- Reduced motion and accessibility: the ring is replaced by a **progress bar and a text cue** ("breathe in", "hold", "breathe out") that works with a screen reader; the hold input is the space key, enter, a large button, or touch; an alternate "tap to start each phase" mode for people who cannot hold.
- Optional `navigator.vibrate` pulse at phase changes behind a setting, guarded for support. Default off.
- Score 0 to 1000 from rhythm accuracy and steadiness. `result`: won at 60 percent or more, otherwise `lost` with warm copy ("The pond is still here. Try again whenever you like."), fled on exit. Never shame.
- `learned`: a one-line note about slow exhales and attention (en and fr), phrased as a general practice tip, not advice.

## Engine

Time is explicit: a fixed 50 ms `tick` action. Input is `hold(true|false)` and `tap(decoyId)`. The bot holds with a seeded timing error that depends on difficulty. Pure and deterministic.

## Party and buffs

The Sleep troop widens the timing tolerance ("rest helps"); the Eat troop adds a gentle hint line; the Move troop makes the rhythm adjustable. `time` buff widens tolerance; `hint` shows the ideal timing guide; `revive` forgives one missed cycle; `luck` removes one decoy; ignore `attack` and `defense`.

## Acceptance

- Unit tests: scoring for perfect, late, early, never-held and always-held inputs; decoy handling; tolerance widening; determinism; the bot's score distribution is sensible per difficulty; all copy has en and fr.
- A person can finish a game in two minutes. The game is fully playable with the keyboard only and with a screen reader through the text cues. No flashing, no sudden changes of brightness.
- `docs/games/still-water.md` includes the not-therapy note and the exact rhythm tables.

## Cut line

Vibration, then the alternate "tap each phase" mode (keep keyboard hold), then the distractions (keep pure rhythm).
