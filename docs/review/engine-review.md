# Engine review: `src/game/` (Haven Protocol game core)

Adversarial correctness review of the pure engine against `docs/design/GDD.md` v1.0 and `docs/design/GDD-errata.md`, 2026-10-18. Scope: every file in `src/game/` including tests and `content/*.json`. Read-only on `src/`.

Every finding below was reproduced with a throwaway vitest file run from the session scratchpad against the real modules (`scratchpad/review/engine.review.test.ts`, 21 assertions, all green = all findings reproduced). The repo suite (`npx vitest run src/game`, 126 tests) still passes; no file under `src/` was touched.

Totals: **0 critical, 2 major, 8 minor, 6 nit.**

---

## 1. Board is regenerated whenever `today < board.day` (reset-hour change, clock set back, westward travel): double rewards, lost progress

- **File:** `src/game/tick.ts:98-103` (`issueBoardDraft`), `src/game/tick.ts:114-125` (`processBoundaries`), `src/game/board.ts:330` (undo day check)
- **Severity:** major
- **Scenario (verified):** Steady player, board for day `X` issued at 12:00, one quest done (+36 XP). In Settings they raise the reset hour 04:00 -> 20:00 at 13:00. The day index is `floor((local - resetHour) / day)`, so `gameDayIndex(13:00, 20)` is `X - 1`. On the next focus `processBoundaries` sees `today (X-1) < lastOpenDay (X)` and runs no boundary, but `issueBoardDraft` only checks `board.day === today`, so it **generates a new board for day X-1**, discarding the current board with its done quest (rewards stay). At 20:00 the index is `X` again, the original board is regenerated from the same seed with every quest open, and the same quest can be completed again: `player.xp` goes 36 -> 72 for one real quest. Meanwhile `undoQuest` is refused all afternoon ("the day is settled") because `board.day !== currentDay`. Lowering the hour (20 -> 4) at 13:00 instead runs a boundary immediately and issues tomorrow's board at 13:00. The same regeneration happens for any backwards move of the local calendar date: a manual clock correction, or flying west across the date line (Tokyo 10:00 Apr 5 -> Honolulu 23:00 Apr 4).
- **Root cause:** all stored day indices (`firstPlayDay`, `lastOpenDay`, `board.day`, `instanceId`, `lastActiveDay`, `lastQuestDay`, `streakLostOnDay`, `combos[].forgedDay`) are in a frame that depends on `settings.resetHour`, and the engine has no notion of "today moved backwards".
- **Fix (two parts):**
  1. Defensive guard in `issueBoardDraft`: never replace a board that is for today or a later day.
     ```ts
     export function issueBoardDraft(draft: SaveFile, day: number, now: number): GameEvent[] {
       if (draft.board && draft.board.day >= day) return [];   // was ===
       ...
     }
     ```
     and in `undoQuest`, treat the board as "today's" when it is the board `lastOpenDay` issued:
     ```ts
     const today = currentDay(save, now, opts);
     if (save.board.day !== today && save.board.day !== save.lastOpenDay) return refuse(...);
     ```
  2. Make the reset-hour change explicit so the day does not jump at all: add `changeResetHour(save, newHour, now, opts): ActionResult` that computes `delta = gameDayIndex(now, newHour) - gameDayIndex(now, oldHour)` (always -1, 0 or +1) and shifts every stored day index by `delta` (`firstPlayDay`, `lastOpenDay`, `board.day` and each `instanceId`, `vassals[*].lastActiveDay`, `stats.lastQuestDay`, `stats.streakLostOnDay`, `combos[*].forgedDay`, `log[*].day`). After the shift `today === lastOpenDay`, the current board survives, and the next boundary happens at the new hour, which is what GDD 15.4 ("applies from the next boundary") means. The store must call this instead of writing `settings.resetHour` directly.
- **Verified:** yes (review test "F1", three cases: raise, undo refused, lower).

## 2. `migrate` unwraps a zustand/persist envelope by overwriting the inner `version` with the outer one: a wrapped v2 save with outer version < 2 is wiped to a fresh save

- **File:** `src/game/save.ts:226-236`
- **Severity:** major (conditional on how the new store persists; data loss if it bites)
- **Scenario (verified):** The store keeps the `SaveFile` as zustand state under `persist({ version: 1 })` (or leaves the default `0`), so localStorage holds `{ state: <v2 SaveFile>, version: 1 }`. `migrate` builds `{ ...raw.state, version: raw.version }`, sees `version 1 < 2`, takes the legacy `{name, level, xp}` path and returns a fresh save: coins 999 -> 0, DP 500 -> 0, board null, and even the name is lost (`'Absolute'`) because the legacy path reads top-level `name`, not `player.name`. The existing test only covers the real legacy envelope `{ state: {name, level, xp}, version: 1 }`.
- **Fix:** prefer the inner version and detect the v2 shape structurally:
  ```ts
  const inner = isDict(raw) && isDict(raw.state) ? raw.state : raw;
  if (!isDict(inner)) return createNewSave(now, undefined, opts);
  const looksV2 = isDict(inner.player) && isDict(inner.vassals);
  const version = typeof inner.version === 'number' ? inner.version
                : looksV2 ? 2
                : typeof (raw as Dict).version === 'number' ? (raw as Dict).version : 1;
  if (version < 2 || !looksV2) { /* legacy path, also read inner.player?.name */ }
  ```
  and add a test for `{ state: v2save, version: 0 }`.
- **Verified:** yes (review test "F4b").

## 3. Reroll can move the Bonus flag onto an already-done quest; undo + redo then pays x2

- **File:** `src/game/board.ts:400` (`db.bonusId = chooseBonus(db.quests)`), `src/game/board.ts:91-103` (`chooseBonus` considers done quests)
- **Severity:** minor (exploit needs an undo/redo; honor-system game, but it is also a visible wrong "BONUS x2" badge on a card that paid x1)
- **Scenario (verified):** ring 3, board `clean.laundry` (T2) + `sleep.anchored` (T3, bonus). Complete `clean.laundry`: paid 39 XP / 2 DP. Reroll `sleep.anchored`: sleep has a single tier-3 template, so the swap falls back to any tier and yields `sleep.lightsout` (T2). `chooseBonus` now picks the first tier-2 quest in board order, `clean.laundry`, which is **done**. Undo it (reverts 39 XP / 2 DP), redo it: 77 XP / 4 DP. Same quest, net +38 XP / +2 DP for a 15-coin reroll. The GDD 6.3 rule "the replacement cannot be the bonus ... otherwise it is recomputed" does not consider done quests.
- **Fix:** recompute only when the rerolled quest was the bonus, and only among quests that are still `open`/`tried`; never move the flag off a done quest.
  ```ts
  if (db.bonusId === id) {
    const candidates = db.quests.filter((x) => x.status !== 'done');
    db.bonusId = chooseBonus(candidates) || chooseBonus(db.quests);
  }
  ```
- **Verified:** yes (review test "F3").

## 4. `migrateBoard` stores the raw board unvalidated; a `rewards` snapshot without `utility` turns the tied utility into `NaN` on undo

- **File:** `src/game/save.ts:215-218`, `src/game/board.ts:345`, `src/game/utilities.ts:57-62`
- **Severity:** minor (any v2 save written before errata 3 added the field, or any hand-edited import; self-heals only on the next reload because `JSON.stringify(NaN)` is `null`)
- **Scenario (verified):** a v2 save whose done quest has `rewards: {xp, coins, dp, loyalty}` (the exact GDD 4 shape) is migrated unchanged. `undoQuest` calls `revertUtilityDraft(draft, 'sleep', undefined)`; `applied === 0` is false, `clamp(90 - undefined)` is `NaN`, so `utilities.power.value` is `NaN` for the rest of the session: `utilityState` reads "out", Well-kept is false, decay keeps it `NaN`.
- **Fix:** normalise every quest in `migrateBoard` (and drop quests whose template no longer exists):
  ```ts
  function migrateQuest(raw: unknown): BoardQuest | null {
    if (!isDict(raw) || typeof raw.templateId !== 'string') return null;
    const t = getQuest(raw.templateId); if (!t) return null;
    const day = ...; const r = isDict(raw.rewards) ? raw.rewards : null;
    return {
      instanceId: typeof raw.instanceId === 'string' ? raw.instanceId : instanceId(day, t.id),
      templateId: t.id, habit: t.habit, kind: t.kind,
      status: oneOf(raw.status, ['open', 'done', 'tried'], 'open'),
      count: Math.max(0, Math.floor(num(raw.count, 0))),
      timer: t.kind === 'timer' ? { startedAt: nullableNum(raw.timer?.startedAt), accumulatedMs: Math.max(0, num(raw.timer?.accumulatedMs, 0)) } : null,
      timedBonus: bool(raw.timedBonus, false),
      rewards: r ? { xp: num(r.xp, 0), coins: num(r.coins, 0), dp: num(r.dp, 0), loyalty: num(r.loyalty, 0), utility: num(r.utility, 0) } : null,
    };
  }
  ```
  Apply the same discipline to `combos[]` (`power` must be a finite number or `comboDefense` is `NaN` and every wave becomes a `loss`) and `titles[]`.
- **Verified:** yes (review test "F4a").

## 5. `gameDayIndex` evaluates the timezone offset at `now - resetHour`, not at `now`: the day rolls one hour late on spring-forward days and one hour early on fall-back days

- **File:** `src/game/time.ts:30-34`
- **Severity:** minor (two one-hour windows per year; a quest at 03:30 on the autumn change-over day is credited to the new day instead of the old one; a quest at 04:30 on the spring day stays on the old board)
- **Scenario (verified):** GDD 6.8 says "take local date-time, subtract resetHour hours, take the local calendar date", i.e. the offset of `now`. The code subtracts 4h in UTC first and then asks the provider for the offset of that earlier instant. During the 4 hours after a transition the two offsets differ by an hour. Europe spring forward (01:00 UTC): at 04:30 local the engine still returns the previous day (GDD: new day); it agrees again from 05:00. Europe fall-back: at 03:30 local the engine already returns the new day (GDD: previous day). Verified with synthetic providers; the existing time test samples only 2h before and 3h after the change and so misses the window. (A midnight transition such as Chile's produces no discrepancy and the index stays monotonic in every case checked; the "day lasts 23h/25h" note in the GDD remains true.)
- **Fix:**
  ```ts
  export function gameDayIndex(nowMs, resetHour, tz = defaultTzOffset) {
    const local = nowMs - tz(nowMs) * 60_000;            // local wall clock of `now`
    return Math.floor((local - resetHour * HOUR_MS) / DAY_MS);
  }
  ```
  and add a test at `change + 1.5h` for both directions. `gameDayStartMs` already iterates and needs no change.
- **Verified:** yes (review test "F2", two cases).

## 6. Trust frozen on a disabled vassal keeps a do-nothing week from being `quiet`, and settlement resets the trust the GDD says must stay untouched

- **File:** `src/game/wave.ts:140` (`totalTrust` over `Object.values(draft.vassals)`), `src/game/vassals.ts:93-95` (`resetTrustDraft` over all habits)
- **Severity:** minor
- **Scenario (verified):** Hardcore, `move` has trust 3, the player disables Move in Settings and does nothing for the rest of the period. `activeVassals` excludes Move from defense (12) but the quiet check still sees trust 3, so the wave resolves as a `loss` (attack 35) and `waveLosses` increments, where errata 4 says an inactive week is `quiet`. Then `resetTrustDraft` zeroes the disabled vassal's trust, contradicting GDD 4 "Disabled habits keep their Vassal record untouched: no decay, no trust".
- **Fix:** compute `totalTrust` from `activeVassals(draft)`; either keep `resetTrustDraft` global (and document it in the errata as the intended reading: trust is period state, not vassal history) or restrict it to active vassals and have the store zero trust when a habit is disabled.
- **Verified:** yes (review test "F6").

## 7. The Full Set (all eight habits in one day) is unreachable from any generated board

- **File:** `src/game/content/combos.json` (`the_full_set`), `src/game/board.ts:114` (`slotsWanted <= questsPerDay`), GDD 6.2 / 12
- **Severity:** minor (dead content; the combos test reaches it only through `setBoard` with eight hand-picked templates)
- **Scenario (verified):** a board has at most `questsPerDay` quests (3/4/5) and `doneHabitsOnBoard` only looks at today's board, so the maximum number of distinct habits done "in one day" is 5 (checked over 600 generated boards at ring 7, all difficulties). The legendary item, the only 12-power item, can never forge; this is a GDD-internal inconsistency rather than a code departure, but it has no errata entry.
- **Fix (pick one, record in the errata):** (a) make the legendary period-scoped: forge when every habit has a `done` quest at some point in the current wave period (track `habitsDoneThisPeriod: HabitId[]` on `WeekState`, cleared at settlement); or (b) retire the item from v1 content.
- **Verified:** yes (review test "F5").

## 8. Unbounded catch-up loop: a corrupt or missing `lastOpenDay` replays every boundary since `firstPlayDay` and stores one quiet `WaveRecord` per week forever

- **File:** `src/game/tick.ts:117`, `src/game/save.ts:251-252` (`lastOpenDay` defaults to `firstPlayDay`)
- **Severity:** minor (needs a damaged save or an import; but the result is permanent save bloat and a Ledger with hundreds of "quiet" rows)
- **Scenario (verified):** v2 save with `firstPlayDay` ten years back and `lastOpenDay` absent -> `migrate` sets `lastOpenDay = firstPlayDay`; `processBoundaries` runs 3,650 boundaries (23 ms, fine) and pushes **521 quiet records** into `week.history`; the serialised save is 190 KB and grows with every such import.
- **Fix:** in `migrate`, default a missing `lastOpenDay` to `today` (not `firstPlayDay`) and clamp `firstPlayDay <= lastOpenDay <= today`; in `processBoundaries`, collapse consecutive quiet records into one (or cap the replay at, say, 400 days and treat the rest as a single "long absence" with the same capped decay, which GDD 6.9 already makes equivalent).
- **Verified:** yes (review test "F11").

## 9. When every eligible vassal is away the board is empty, and re-recruiting does not refill it until tomorrow

- **File:** `src/game/board.ts:111-131` (empty `habitsEligible` -> 0 slots), `src/game/vassals.ts:101-117`
- **Severity:** minor (Strict mode, one enabled habit or a long absence; the "one-action fix" of pillar 1 leaves the player with nothing to do for a day)
- **Scenario (verified):** Strict, only Move enabled, Pell away. `processBoundaries` issues a board with `quests: []`, `bonusId: ''`. Tapping Welcome back succeeds, but `issueBoardDraft` sees `board.day === today` and keeps the empty board; the next `processBoundaries` is a no-op.
- **Fix:** in `reRecruitVassal` (and the vassal branch of `applyResurrection`), when `draft.board?.day === day` and the board has no open quest, regenerate: `draft.board = generateBoard(draft, day)`. Optionally also add the returning vassal's quest to a non-empty board.
- **Verified:** yes (review test "F9").

## 10. `completeQuest` ignores `enabledHabits`: completing a quest for a habit disabled mid-day mutates the "frozen" vassal and utility

- **File:** `src/game/board.ts:239-244`
- **Severity:** minor
- **Scenario (verified):** Sleep disabled at 13:00 while its quest is still on the board (GDD 15.4 only hides the vassal; the quest card is a UI decision). Completing it gives loyalty 50 -> 56, trust 1, Power 40 -> 65 on a vassal/utility the GDD says is frozen.
- **Fix:** `if (!isHabitEnabled(save, q.habit)) return refuse(save, 'habit is disabled');` in `completeQuest`, `markTried`, `startTimer`, `incrementCount`; or have the store remove those quests from the board when a habit is disabled (document whichever is chosen).
- **Verified:** yes (review test "F8").

## 11. Wave log ring-progress line uses the pre-unlock ring with post-award DP ("132/120 toward The Flat")

- **File:** `src/game/wave.ts:96-100`, order of `domainPoints += dp` (161), `buildLog` (177), `recomputeRingDraft` (188)
- **Severity:** nit (cosmetic, but it is stored on the record and replayed in the Ledger)
- **Scenario (verified):** DP 110, decisive wave +22 -> 132 crosses ring 2; the stored last line reads `Domain Points +22. 132/120 toward The Flat`.
- **Fix:** call `recomputeRingDraft` before `buildLog` and collect its events, or print "The Flat is registered" when `domainPoints >= next.domainPointsRequired`. Keep `ringAtSettlement` for attack/walls as now.
- **Verified:** yes (review test "F7").

## 12. Ring can drop on undo and `ringUnlocked` fires again when it is re-crossed

- **File:** `src/game/economy.ts:223-230`, `src/game/board.ts:341`
- **Severity:** nit (GDD 6.7: "a ring unlock overlay already shown is not re-shown"; the engine gives the store nothing to dedupe with)
- **Scenario (verified):** DP 119, complete (+1, ring 2, event), undo (ring 1), redo: a second `ringUnlocked 2` event.
- **Fix:** add `stats.highestRingReached` (bumped in `recomputeRingDraft`, never lowered) and emit `ringUnlocked` only when `after > highestRingReached`; or document that the store dedupes by ring.
- **Verified:** yes (review test "F10").

## 13. `incrementCount` on a done counter above the target has no same-day guard

- **File:** `src/game/board.ts:216-222`
- **Severity:** nit (board is normally replaced at the boundary; only reachable while the app sits open past the reset hour)
- **Scenario (verified):** counter done on day D, `incrementCount(+1)` with `now` on D+3 succeeds and mutates the stale board.
- **Fix:** apply the same `currentDay` check as the undo branch, or make the `>= target` branch a pure no-op (`return ok(save, [])`) since counting past the target has no effect.
- **Verified:** yes (review test "F12").

## 14. Catch-up log line hard-codes `name: 'Pell'`

- **File:** `src/game/tick.ts:121`; `strings.catchUp[4]` uses `{name}`
- **Severity:** nit
- **Fix:** pick the enabled, present vassal with the highest loyalty (or seed-pick one with `fnv1a`), e.g. `vassalName(activeVassals(draft)[0]?.habit ?? 'move')`.
- **Verified:** yes (by reading `strings.json:177`).

## 15. Silent departures from the GDD with no errata entry (document or align)

- **Severity:** nit (behaviour is defensible in each case; the errata should say so)
  - `reRecruitVassal` and the vassal branch of `applyResurrection` set `lastActiveDay = today` (GDD 5: "Nothing else changes"). Sensible (fresh grace day) but undocumented. Side effect: the vassal's first completion that day earns no trust pip (`markActiveDraft` needs `lastActiveDay < day`); moot today because the returning vassal has no quests until tomorrow (see 9).
  - A vassal leaving zeroes its trust (`vassals.ts:80`). Not in the GDD.
  - Battle-log header is `Wave {w} reaches {ring}: {monster} at the gate. Attack {a}.` with a seeded monster roster and a boss every tenth week (`wave.ts:23-42`); GDD 9.5 specifies `Wave {w} reaches {ringName}. Attack {attack}.` and no monsters. Fine flavour, undocumented; the UI mock in 15.6 shows the GDD form.
  - Reroll same-tier fallback draws from any tier, lower included (GDD says "any tier if none"), which is what enables finding 3.
  - `generateBoard` recomputes the seed from the *current* name and ignores `board.seed`; "replay any day" after a rename needs the stored seed. Add an optional `seed` parameter (`generateBoard(save, day, seed = boardSeed(...))`). The board itself is correctly not regenerated on rename (verified).
  - `content/schema.md` says vassal XP is `baseXp` ("Also the vassal XP"); GDD 6.4 and the code use the post-multiplier `xp`. Fix the schema note.
  - `migrate` hard-codes `clamp(level, 1, 30)` and `clamp(trust, 0, 7)` instead of `VASSAL_LEVEL_CAP` / `TRUST_MAX`; `createNewSave` accepts `settings.enabledHabits: []` (migrate guards it, the constructor does not).

## 16. Strict -> Benevolent switch strands away vassals

- **File:** `src/game/vassals.ts:72` (`away` vassals are skipped regardless of mode), `src/game/board.ts:60`
- **Severity:** nit / store contract
- **Scenario:** in Strict a vassal goes away; the player switches to Benevolent. GDD 5 only shows the "Welcome back" button in Strict mode, the engine keeps excluding the vassal from boards and decay, so unless the store either shows the button in both modes or calls `reRecruitVassal` for every away vassal on the switch, the vassal is gone for good, which breaks pillar 1.
- **Fix:** add `setBenevolence(save, mode, now, day)` to the engine that re-recruits all away vassals when switching to Benevolent; or document that the store must.
- **Verified:** plausible from code reading (not scripted; the engine behaviour is unambiguous, the gap is in who calls `reRecruitVassal`).

---

## Checked and found correct

- **Catch-up after 1 / 2 / 7 / 30 days** (`tick.ts`): one boundary per missed day, loyalty decay capped at 7 applications and utility decay at 3 per vassal/utility per catch-up (errata 2), no double application across two consecutive opens, `lastOpenDay` and `board.day` both land on `today`, a second call the same instant is a no-op, `catchUp` only for >= 2 days. Verified by script for all four gaps.
- **Wave settlement exactly once** per period (`isWaveBoundary` on `dayEnded`), period index derived from the day rather than `week.index`, quiet resolution when total trust is zero (errata 4), trust reset and combo expiry after the record is built, well-kept measured after that day's utility decay as GDD 6.8 orders it. History indices are unique and consecutive after a 30-day gap (4 quiet waves, 0 DP).
- **Trust** counts distinct active days per period, capped at 7, a `tried` then `done` on the same day counts once, completions on the last day of a period count for that period.
- **Reward snapshot / undo symmetry**: undo reverts the stored snapshot (XP, coins, DP, vassal XP, applied loyalty, applied utility) and is immune to title multipliers changing between complete and undo (verified by adding titles in between); levels and vassal levels go down correctly; `bestQuestDayStreak` is kept as a high-water mark; titles are never revoked; `combosForged` is decremented only for items broken by the undo.
- **Timers**: pause/resume segments accumulate, starting another pauses the first, the boundary stops a running timer, `timedBonus` is decided at completion only, negative elapsed is clamped at 0.
- **Count quests**: auto-complete at target, counting past the target awards nothing, stepping below the target undoes with the same-day rule, direct `completeQuest` fills the count.
- **Loyalty grace day** (errata 1) reproduces 26 / 18 / 11 days from 50; Benevolent floors at 1, Strict at 0 then `away`; disabled and away vassals are untouched by decay.
- **Resurrection**: calendar-month key is computed in local time via the tz provider (`currentMonthKey`), 14-day window measured in game days, streak restore adds the rebuilt run, away vassals return at >= 50.
- **Ring derivation**: re-derived from DP on migrate, after quest DP, after wave DP and after undo; never set directly outside `recomputeRingDraft`.
- **Seed determinism**: `fnv1a("firstPlayDay:day:name")` exactly as GDD 6.3 step 1 (name inclusion is intended and documented); renaming mid-day does not regenerate the board; reroll RNG is seeded from the board seed and instance id.
- **Default tz provider**: `Date#getTimezoneOffset` sign convention is applied correctly (`local = utc - offset`), `fixedTz(-120)` is UTC+2 as documented.
- **`noUncheckedIndexedAccess` paths**: every indexed read in `rng.ts`, `board.ts`, `economy.ts`, `content/index.ts` is guarded (`?? 0`, `?? null`, explicit `undefined` checks); `rngWeightedIndex` falls back to the last index; loyalty weights are always >= 20.
- **Legacy migration**: `{name, level, xp}` with and without the real `usi.player` persist envelope (`{ state, version: 1 }` as written by `src/state/playerStore.ts`) keeps name/level/xp and starts everything else fresh; v2 round-trips through `exportSave`.
- **Content**: 79 templates, ids unique, every `minRing` in 1..4, tier-1 `baseXp` (15-22) < tier-2 (35-38) < tier-3 (55-60) with no inversions, coins likewise, DP per quest equals tier, 21 titles and 18 combos match the GDD tables (names, thresholds, powers), rings table matches section 7, `validateContent()` runs in CI. Hygiene has only tier-1 templates at ring 1 and sleep a single tier-3 template overall; both are handled by the tier fallback (and the latter is what finding 3 exploits).
- **Economy constants**: XP curve table, vassal curve, difficulty tables, attack formula examples, DP awards, utility restore/decay with clinic and title multipliers all reproduce the GDD numbers.

---

## Resolution (game-core pass, 2026-10-18)

All fixes live in `src/game/**`; each finding has a regression in `src/game/review.test.ts` (numbered as here). Suite: 126 -> 155 tests, `npx eslint src/game` and `npx tsc --noEmit` clean. Errata entries 7-19 document every departure. API additions (all additive): `changeResetHour`, `setBenevolence`, `comboRequiredHabits`, `generateBoard(save, day, seed?)`, `player.highestRing`, constants `CATCHUP_MAX_DAYS`, `WAVE_HISTORY_MAX`, `FULL_SET_MIN_HABITS`; `reRecruitVassal` moved to `recruit.ts` (same export from `index.ts`).

| # | Severity | Resolution |
|---|---|---|
| 1 | major | **Fixed.** `issueBoardDraft` only issues when `board === null \|\| board.day < today`; undo/counter edits accept the `lastOpenDay` board while the index is behind it. `changeResetHour(save, hour, now)` shifts every stored day index by `gameDayIndex(now, newHour) - gameDayIndex(now, oldHour)` so "today" is unchanged and the day ends at the next occurrence of the new hour (errata 7). The store must call it instead of writing the setting. |
| 2 | major | **Fixed.** `migrate` unwraps the envelope, detects the v2 shape structurally, the inner `version` wins; the legacy path also reads `player.name`. Tested with outer version 0, 1 and none (errata 8). |
| 3 | minor | **Fixed.** The bonus flag moves only when the bonus itself was rerolled, and only onto an `open` quest (errata 9). |
| 4 | minor | **Fixed.** `migrateQuest` normalises every quest (missing `rewards.utility` -> 0, unknown templates dropped, done-without-snapshot reopened, stray `bonusId` cleared); combos, titles, wave history and log are validated too (errata 8). |
| 5 | minor | **Fixed.** `gameDayIndex` uses the offset at `now` per the GDD formula; README documents it; tests at change +1.5h both directions plus monotonicity sweeps (errata 10). |
| 6 | minor | **Fixed.** Quiet check uses `activeVassals`; `resetTrustDraft` stays global and is documented as intended (errata 11). |
| 7 | minor | **Fixed.** The Full Set forges when every enabled, present habit (minimum 5) is done on one board; unforge uses the same rule (errata 12). |
| 8 | minor | **Fixed.** Replay capped at `CATCHUP_MAX_DAYS` (400) with a fast-forward of `lastOpenDay`/`week.index`; `week.history` capped at 104 at settlement and on migrate; missing `lastOpenDay` defaults to today (errata 13). |
| 9 | minor | **Fixed.** `returnVassalDraft` (Welcome back, token, Benevolent switch) re-issues an empty board for today from the stored seed (errata 14). |
| 10 | minor | **Fixed.** `completeQuest`, `markTried`, `startTimer`, `incrementCount`, `rerollQuest` refuse quests of a disabled habit with `habit is disabled` (errata 11). |
| 11 | nit | **Fixed.** Reward line reads `{ring} is registered.` when the award crosses a threshold (errata 16). |
| 12 | nit | **Fixed.** `player.highestRing` added; `recomputeRingDraft` keeps the ring sticky and emits `ringUnlocked` only when `highestRing` rises; `migrate` fills it (errata 15). |
| 13 | nit | **Fixed.** The `>= target` branch of `incrementCount` on a done counter applies the same-day rule. |
| 14 | nit | **Fixed.** The catch-up line greets with the enabled, present vassal of highest loyalty. |
| 15 | nit | **Fixed / documented.** `lastActiveDay = today` on return and trust zeroed on leaving (errata 17); monster header (errata 19); any-tier reroll fallback (errata 9); `generateBoard` seed parameter (errata 19); schema note corrected; `migrate` uses `VASSAL_LEVEL_CAP`/`TRUST_MAX`; `createNewSave` ignores `enabledHabits: []`. |
| 16 | nit | **Fixed.** `setBenevolence(save, mode, now, day)` re-recruits every away vassal when switching to Benevolent (errata 18); the store should call it instead of writing the setting. |
