# Notes: Decision Dungeon (`game-decision-dungeon`)

Branch `feat/game-decision-dungeon-v2` (draft PR #27, stacked on `feat/game-tower-defense-v2`, PR #25). Files owned: `src/games/decision-dungeon/**`, `e2e/games/decision-dungeon.spec.ts`, `docs/games/decision-dungeon.md`, `docs/games/img/decision-dungeon-*.png`, this file.

This page is the audit of the seeded build (the overnight Cursor commit `9d1a679`) against `docs/briefs/games/README.md`, `docs/briefs/games/decision-dungeon.md` and `docs/design/games/CONTRACT.md`, and the record of what was fixed, cut or decided. The first pass was a full read of the seeded engine, Screen, 18+18 scenarios, docs and tests.

## 1. Baseline: the seeded state against today's kit

Run on the untouched seed commit, in a fresh worktree: `npm run lint`, `npm run typecheck`, `npm test` (75 files, 992 tests), `npm run build`, `node scripts/games-budget.mjs` (code 71.2 KB of 150), `npm run screenshots:check`, `node scripts/check-main-chunk.mjs`: **all green**. The contract kit (locale argument, `forfeit`, `## Party` and `## Buffs` headings, `fr` runs, frozen matrix) had no complaint. So the seeded game passed every mechanical check; its problems were content, design and honesty, which the kit cannot see. They are listed below.

## 2. What was wrong in the seeded build

Content (the main risk):

1. **The French was a machine translation of the English**, not written for French: calques and nonsense ("un trapèze poli dans le plancher", "le hello", "une assiette avec de la merci", "tu disparaisse", "un toi plus tard", "Les tas poussent dans le noir"), mixed registers and gendered forms about the player.
2. **Strained, sometimes unsafe wording in English**: "a bill you pay twice", "glue you to the hurt", "the sandwich is not a trial", "sugar and defeat", "your nervous system" (a quasi-medical claim), a "courtroom" image, a "weather system" metaphor repeated across rooms. Some reflections read as judgement ("The list is trying to be seen", "Taking the room as a shove makes a second mess").
3. **Tags were applied loosely.** `boundary` was given to "thank them and say the right name", "talk less and pass the floor" and "keep the promise you already made", which are not boundaries. Some `constructive` options were a boundary and vice versa.
4. **The answer leaked.** The `cue` shown at difficulty 1 and 2 named the quality of the door ("start tiny", "fix and name", "kind and firm", "reactive").
5. **The constructive option was the longest label in most scenes**, and often the last or the third.
6. **A reflection could tell a reactive player "you are...".** There was no guard against shaming words, and no guard for alcohol, debt or loss.

Engine and scoring:

7. **The draw used about 10 of the 18 scenarios.** At difficulty 1 and 2 it sorted by ease and took the first distinct moods, so scenes `s01` to `s04` were in every game, whatever the seed.
8. **The variety bonus paid for reactive and avoidant doors** (40 points per distinct style, any style), so picking a reactive door in a room could raise the score. A flawless run could not reach 1000 (maximum 880).
9. **`learned` was mostly irrelevant**: the "weakest style" was the first style never chosen (almost always `reactive`), so a player who chose well was given the tip for reacting in anger; the topic was a bare style name. It was also produced with zero rooms answered.
10. **Social revealed the constructive door first**, i.e. the answer, in every room.
11. **`luck` ranked ease-3 rooms last and salted the door order**, which made the "gentler scenario" claim untrue (the draw never used ease 3 at low difficulty anyway).
12. **The bot mixed the seed into its dice with arbitrary arithmetic** and revived with `rng() < 0.85`.
13. **All the long text was imported by the engine**, so it shipped in the registry chunk with every manifest (CONTRACT section 4.13: long texts the engine does not score live Screen-side).

Screen and tests:

14. **Sleep on it was a "peek" button on every door** (up to 8 buttons in a room, hard to use at 320 px).
15. **No focus management** (after a choice the focused door disappeared), no end-of-run summary on screen, the "learned" tip never shown to the player in the game itself.
16. The 40 unit tests covered the engine but asserted none of the content properties (option-order variety, forbidden topics in French, tone), and no test caught items 1 to 6.

## 3. Checklist against the brief

Legend: done = was right in the seed and kept; fixed = was wrong or weak, now right; cut = removed with a reason.

| # | Requirement | Status |
| --- | --- | --- |
| 1 | 18 original scenarios per language, same structure en and fr | **fixed**: 18 new scenarios written from scratch, French written separately (`texts-fr.ts`), structure shared in `content.ts` and enforced by `content.test.ts` |
| 2 | 25 to 50 word situation | **fixed** and tested for every scenario in both languages |
| 3 | Mood tag, topic | done: 7 moods and 7 topics, all covered |
| 4 | 3 or 4 options, hidden style tag from the five | **fixed**: tags re-audited one by one (item 3 above) |
| 5 | One or two constructive options, never all constructive | **fixed**, tested (also: always at least one reactive or avoidant) |
| 6 | 20 to 40 word warm reflection per option, never shaming | **fixed**: all rewritten, tested for length and against shaming words |
| 7 | Constructive not always longest, last, or in the same place | **fixed**: label length, source position and display position are all tested |
| 8 | 5 to 7 rooms from the seed, easier first, mood variety | **fixed**: draw uses the whole catalogue (60 seeds cover all 18), ease non-decreasing, neighbour moods mostly different |
| 9 | `run.difficulty` makes choices subtler | **fixed**: cues (plain description) only at 1 and 2, subtler scenes only from 3, more rooms, a bot that slips more |
| 10 | No scenario repeated within a game | done and tested for every difficulty, 60 seeds, three luck levels |
| 11 | Score from the share of constructive and boundary, plus variety bonus | **fixed**: `floor(900 * good / rooms) + 50 * tools`, flawless run = 1000, no loophole (exhaustively tested for every run of 1 to 7 rooms) |
| 12 | `won` at 60 percent, `lost` otherwise with warm copy, `fled` on exit | done: exact integers `good * 5 >= rooms * 3`; "the troops come home" wording kept |
| 13 | `learned`: strongest style, one tip for the weakest, en and fr | **fixed**: strongest style, ties to the good styles; the tip speaks to a reactive or avoidant habit when that is the strongest style, otherwise to the tool practised least; absent when nothing was answered |
| 14 | Social reveals a style tag | **fixed**: a seeded random door, not the answer; every room for a troop of power 20 or more, every second room otherwise (power now matters) |
| 15 | Sleep "sleep on it" once per run | done as a toggle plus Preview (one control, not one per door); a power 20 troop gets two (documented extension) |
| 16 | Study shows the reframing question | done: one question per scenario, in both languages |
| 17 | Buff mapping: hint, revive, luck; ignore attack, defense, time | done: `hint` reveals one more style, `revive` is Choose again, `luck` swaps the hardest rooms for gentler unused ones; the three ignored are documented |
| 18 | Keyboard: number keys | done (1 to 4, ignored while typing), plus focus moves to Next room and to the new room |
| 19 | Reduced motion | done: the only motion is a fade-in of the room, removed when `reducedMotion` or the OS setting says so |
| 20 | Determinism, pure engine, locale argument | done: no `Math.random`, `Date`, `navigator`; `initial(seed, party, run, locale)` keeps the language for the log and the learned note; English and French draw the same dungeon |
| 21 | Bot with a seeded error rate | **fixed**: `BOT_MISS` 46 to 74 percent by difficulty from `turnRng`, trusts revealed styles 70 percent of the time; wins 40 to 70 percent at difficulty 2 with the full party (tested) |
| 22 | Leaving early scores through the engine (`forfeit`) | done: Step away dispatches `forfeit` and keeps the board; Leave is a separate button using `exit()` |
| 23 | Contract kit, lint, typecheck, budget, screenshots | green (section 5) |
| 24 | At least 25 unit tests | **fixed**: 22 content + 49 engine + 15 Screen tests, plus the 10 kit checks |
| 25 | e2e: loads and axe, plays to an outcome, same seed same outcome, under 20 s each | done, plus French and keyboard, difficulty, party perks, responsive |
| 26 | Docs: topics, tag definitions, not-therapy note, generic help line, no phone numbers | done in `docs/games/decision-dungeon.md`, `## Party` and `## Buffs` present |
| 27 | Three screenshots at most, 150 KB in total | done (`start`, `reflection`, `end`) |
| 28 | Topic list and forbidden topics guard | done in both languages, and the guard itself is tested against samples |

Cut: nothing from the brief. The cut line (scenarios 13 to 18, Sleep on it, the variety bonus) was not needed. The per-door peek buttons of the seed were replaced by one toggle (a redesign, not a cut).

## 4. Content audit (every scenario read in both languages)

Every one of the 18 situations, 66 doors (20 constructive, 17 reactive, 16 avoidant, 7 boundary, 6 curious) and 66 reflections was read in English and in French after the rewrite (not only the length checks). Findings and decisions:

- **Originality.** Everyday premises that anyone could invent (a missed bus, a wrong total, a cancelled dinner, a broken glass); no example, phrase or exercise taken from a book, article or therapy handout. The wording avoids the stock formulas of those sources ("I statements", "thought records", named techniques): the game never names a technique.
- **Tone.** Each reflection starts by recognising the feeling or the reason for the move, says what the move costs or gives, and ends on something the player can still do. Reactive and avoidant reflections never open with praise and never use "you should", a verdict or an adjective about the player (guarded by tests). Constructive and boundary ones praise the move, not the person. Curious doors are called "a good start" and "a good instinct" and point to the next step; they are not penalised beyond the score share.
- **Boundary means a boundary.** Only options that say kindly what the player can or cannot do (or needs) carry `boundary` (s04, s07, s08, s12, s14, s16, s18); "keep a promise", "thank them" and similar were re-tagged `constructive` or rewritten.
- **French.** Written for French, tutoiement, no `vous`, no gendered adjective or past participle about the player (`déçu`, `invité`, `éloigné` avoided), natural idioms (`l'apéro`, `ça pique`, `ça m'est égal`), typographic non-breaking spaces before `?`, `!`, `:`, `;`. French scenes are not word for word (different details: apéro, relevé de compte, a neighbour in the stairs), but have the same ids, moods, ease and option styles in the same order.
- **Forbidden topics.** None present. During the audit alcohol (a bill with wine) was removed and replaced with desserts, a "debt" word and a courtroom image were not kept, and a keyword guard (English and French) now covers self-harm, abuse, violence, harassment, trauma, diagnosis, therapy, medication, doctors, lawyers, courts, police, politics, religion, bereavement, alcohol, drugs, diets and debt.
- **Stereotypes.** No gender, age, culture or job assumption. English uses "they" for others; French alternates "un ami / une voisine / ta responsable / un collègue".
- **No claims.** No sentence says what a choice "means" about the player, nor claims a benefit to mental health. The UI says "a game, not therapy" on every room, and the docs repeat it with the generic "talk to someone you trust or a professional" line (no phone number, no organisation, no link anywhere; a test forbids digits and links in the scenes).
- **Plausible, human options.** Reactive and avoidant doors are things a decent person really does on a bad day, written without caricature ("go quiet", "join the next dinner anyway").
- **Option order.** The constructive door is the single longest label in 4 of 18 English and 6 of 18 French scenes (tested to at most 6); it is the first constructive door in 6, 7, 4 and 1 scenes of the source orders (positions 1 to 4) and the last option in 4 scenes; the display order is shuffled from the seed (every display position of a four-door room turns up between 12 and 40 percent of the time, tested).

## 5. Decisions (nobody was available)

1. **Structure shared, words separate.** `content.ts` (ids, mood, topic, ease, option styles) is what the engine reads; `texts-en.ts`/`texts-fr.ts` are Screen-only. This follows CONTRACT section 4.13 and keeps the engine in the registry chunk small. The same seed therefore gives the same dungeon in English and French, which is a feature (replay in the other language). The locale still matters: the engine keeps it for the outcome log, the `learned` note and the Screen text.
2. **`curious` does not score.** The brief scores constructive and boundary only; curious is part of the toolbox (variety bonus, 50 points once) and its reflections say it is a good first step. Its doors are written as wondering or asking without yet acting, so the distinction is honest.
3. **Score** is `floor(900 * good / rooms) + 50 * tools` (constructive, boundary, curious used at least once); never `+` for reactive or avoidant. A flawless run using both tools is 1000; one more good door always beats any bonus.
4. **Social is seeded random, not the answer**; every room for power 20 or more, every second room below. **Sleep** keeps "once per run" for a weaker troop and gives a power 20 troop two (the brief says once; the extra makes strength matter, and is documented).
5. **Bot calibration.** The kit's bot has its own PRNG independent of the seed, so slips are drawn from `turnRng(seed, ...)`. With the full party on plain difficulty 2 the bot wins 67 percent (200 seeds); the starter party wins 34 percent, so the party is a real, noticeable help while the game stays playable without it. Win rates by difficulty with the full party: 79, 67, 48, 41, 19 percent.
6. **Short words, not a verdict, for styles.** Players see "a quick reaction", "stepping back", "a small next step", "a kind limit", "checking first" (and the French equivalents), never the raw tag names, so a revealed tag or a result line never labels the player.
7. **No help line beyond the generic one**, as the brief asks: no phone number, organisation or link, in the game, the docs or the PR.

## 6. Files needed that I do not own

None. The lab, helpers, kit and lint were enough. (Observation only: `expectResponsiveGame` checks 320x568 and 844x390, not 150 percent text; 390x844 at 150 percent was checked by hand, see section 7.)

## 7. Verification

```
npm run lint                                  clean
npm run typecheck                             clean
npm test                                      76 files, 1048 tests pass (Decision Dungeon: 96 = 22 content + 49 engine + 15 Screen + 10 contract kit)
npm run build                                 ok
node scripts/games-budget.mjs                 decision-dungeon code 80.6 KB / 150 KB, assets 0 / 200 KB
node scripts/check-main-chunk.mjs             ok (no game in the main chunk)
npm run screenshots:check                     ok
npx playwright test e2e/games/decision-dungeon.spec.ts --workers=2
                                              13 passed, 1 skipped (axe on desktop by design), both projects, every test under 3 s
```

Responsive check, by eye on screenshots taken from a production preview (`#/lab/decision-dungeon?difficulty=1..5&lang=fr` and `lang=en`, `localStorage['haven.debug']='1'`, five states each: start, a reflection, hints and Sleep on it on the mixed buffed party, the end of a run): 320x568, 390x844 at 150 percent root text and 844x390. No horizontal scroll (`scrollWidth` equals the viewport at every size), nothing clipped, doors and buttons wrap their text. Two fixes came out of it: the not-therapy line was hidden in landscape (now always visible), and the cue and tag lines were 12 px (now 14 px).
