# Decision Dungeon (`decision-dungeon`)

A short practice of choosing a constructive response to everyday friction. Each room is an ordinary situation: a missed bus, a blunt message, a form on the table. You pick a door, read a warm reflection, and walk on. The monsters are only first reactions in disguise.

This is a **game, not therapy**. It does not diagnose, treat, or replace talking to someone you trust or a professional.

| Field | Value |
| --- | --- |
| Category | self-development |
| Minimum ring | 1 |
| Roster | 1 to 8 |
| Length | about 4 minutes |

## How to play

A run is 5 rooms on difficulties 1–2, 6 on 3–4, and 7 on 5. Rooms are drawn from 18 scenarios (English or French, same structure, different scenes), ordered so easier rooms and a mix of moods come first. Each room offers 3 or 4 doors. After a choice, a 20–40 word reflection explains the effect without shaming a reactive door. **Step away** ends as `fled` and keeps the rooms already walked. **Leave** closes the screen.

Touch: tap a door. Keyboard: Tab to a door, or press `1` to `4` for the n-th door. Keys are ignored while a field (the Lab seed box) is focused.

Difficulty 1–2 shows a short cue on each door so the quality of the choice is easier to read. Difficulty 3–5 hides the cue.

Reduced motion: rooms do not fade; the layout stays the same.

Score 0–1000: `floor(800 * good / rooms) + 40 * distinct styles`, where `good` counts constructive and boundary choices. You **win** at 60 percent good or better (`good * 5 >= rooms * 3`); otherwise the troops still come home, just without a lighter bag. A variety of styles is a score bonus (practice the whole toolbox), not a win condition.

`learned` names the strongest style this run and offers one practical tip for the weakest, in English and French.

## Topics

Ordinary friction only:

- transport
- work friction
- procrastination
- social situations
- small failures
- money annoyance
- family logistics

**Not in the dungeon:** self-harm, abuse, trauma, medical or legal advice, politics, religion, or anything a vulnerable player could find triggering. Tests scan the rooms against a keyword guard list.

## Tag definitions

| Tag | What it practises |
| --- | --- |
| `reactive` | The first flash of heat: snapping, matching tone, making a show of shame. |
| `avoidant` | Stepping around: hiding the form, muting the chat, hoping the table is never read. |
| `constructive` | A small next step that keeps the day moving. |
| `boundary` | A kind, firm limit: some sharing, not all of it; a kept promise and a later slot. |
| `curious` | Checking the story before moving in. |

Every room has one or two constructive doors, and never only constructive ones. After a reactive choice the reflection still starts from “understandable”.

## Party

Habits, not combat. A starter party (Move, Outside, Clean) is fully playable and sees the rooms as they are.

- **Social** reveals the style tag of one door per room (a constructive one when there is one). If that member’s `power` is 20 or more, two tags are revealed.
- **Sleep** unlocks a single “sleep on it” peek: the reflection of one door before you choose, once per run.
- **Study** shows the room’s reframing question.

`troopsUsed` lists the Social member when they reveal tags, Sleep if a peek was used, and Study when they are in the party. Citizen members (`habit: null`) do not grant a perk.

A level 12 Social troop (power 44) shows two tags; a level 1 Social troop shows one. Power is otherwise unused: the skill is the choice, not a damage number.

## Buffs

- `hint`: each point is one extra tag you can reveal on the current room (the **Reveal a tag** button).
- `revive`: each point lets you re-pick the current room after the reflection.
- `luck`: gentler draw (ease-3 rooms wait) and a luck-salted door order.
- `attack`, `defense` and `time` are ignored: there is no combat and no timer.

## Determinism

Room draw comes from `mulberry32(fnv1a('decision-dungeon:<seed>'))`. Door order comes from `turnRng(seed, 100 + roomIndex)` (plus 17 when luck is present). Hints pick a hidden door with `turnRng(seed, 800 + roomIndex * 10 + hintsLeft)`. The same seed, party, run and language always give the same dungeon. Locale picks the English or French scenes; ids, moods and styles match across languages.

## Bot

`botPlay` peeks when Sleep is in the party, spends hints, undoes a non-good choice when a revive remains, and otherwise picks a constructive door with a seeded error rate that rises with difficulty.

## Screenshots

Written by `e2e/games/decision-dungeon.spec.ts` (`shootGame`, mobile project).

| Start | End |
| --- | --- |
| ![Decision Dungeon at the start](img/decision-dungeon-start.png) | ![Decision Dungeon at the end of a run](img/decision-dungeon-end.png) |
