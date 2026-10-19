# Custom quests and adaptive proposals

Feature spec as built. Two linked features:

- **Custom quests**: the player writes a quest in their own words, by voice or text. An on-device, rule-based parser turns the sentence into an editable draft; the engine stores it as a template and puts it on the Board, once or on a recurrence.
- **"The Haven notices"**: up to three small, rule-based suggestions at the top of the Board, computed on the device from the player's own history. Accepting one goes through the same functions as the Compose sheet.

Nothing here uses the network, a model or the clock (the engine receives `now`). All of it is pure TypeScript in `src/game/` with a thin UI on top; the pillars hold: no loss states, warm copy, one action to answer or ignore anything.

Code map: `src/game/template.ts` (resolution, effort tiers), `src/game/custom.ts` (templates, board, recurrence), `src/game/adapt.ts` (activity, proposals), `src/game/compose/parse.ts` and `keywords.ts` (parser), `src/hooks/useSpeechRecognition.ts`, `src/screens/ComposeQuestSheet.tsx`, `src/components/ProposalsSection.tsx`, `src/components/MyQuestsSection.tsx`. Copy lives in `strings.json` under `compose` and `proposals` (documented in `content/schema.md`).

---

## 1. Flows

### 1.1 Compose (Board)

The Board has a prominent primary button, "+ Add my own quest" with a microphone icon (under the day line and the proposals, above the list). It opens the **Compose sheet**, a native modal `<dialog>` in system-window style (focus trapped, Escape closes, scrolls inside itself, mounted only while open so each opening starts blank).

1. **Capture.** One textarea ("Your quest, in your own words"), focused on open, and a "Speak it" button when the browser has the Speech API. Interim words show live ("Hearing: ..."), a red "Listening..." status with a pulsing square (static under reduced motion) and a "Stop" button are shown while recording, and the final phrase is appended to the textarea. The player can edit the text freely at any time. Several utterances append.
2. **Parse.** As soon as there is text the sheet shows the parsed draft as editable fields: vassal picker (eight portraits, native radios), kind (Check / Timer / Counter), minutes or how many, name, how often, time of day, effort tier (1 to 3), and a rewards preview computed by the engine. Low-confidence fields raise a question ("Which vassal should take this one?") and get a dashed outline until touched. Edits are kept when the sentence changes later.
3. **Save.** Three buttons:
   - **Add to board today**: creates the template (with the recurrence shown) and puts one copy on today's board. Disabled, with a note, when two of the player's own quests are already there, when the habit is off or its vassal is away, or when there is no board yet.
   - **Save as recurring** (shown when the recurrence is not "Just once"): creates the template, does not add today's copy; it starts on the next board. When the recurrence is "Just once" this button reads **Save for later** and keeps the template in My quests.
   - **Cancel**: nothing was saved. Nothing is saved before a button is pressed.

A refusal (duplicate name, 30 templates already, invalid field) is shown inline in the sheet, not as a toast, because a toast would sit under the modal.

On success the sheet closes and one toast says what happened ("... is on today's board." or "... is in My quests.").

### 1.2 On the Board

A custom quest is a normal card with a small "Mine" tag. It has Done, I tried, timer or counter like any quest and Undo until the day settles. It has no Swap button (a swap draws a shipped template of the same habit; swapping the player's own words away would be wrong) and it never carries the Bonus x2.

### 1.3 Ledger: My quests

A "My quests" window lists the active templates: habit icon, name, vassal, effort, recurrence, tier, source chip (Spoken / Typed / From the Haven) and the stats line "Issued N, settled N, attempted N". Buttons: **Add to today** (disabled when already on the board, when two are there, or when the habit is off), **Edit** and **Archive** (confirm dialog). Archiving stops recurrence and removes an untouched copy from today's board; a copy that was already worked on stays and can still be settled or undone. History and stats are never deleted. An empty state links back to the Board.

**Edit** opens the Compose sheet in edit mode (section 1.5). **Archived** quests wait in a collapsed group at the bottom of the window ("Archived (N)", newest first, the same facts and stats line, a dashed border). Each has one button, **Restore**, which brings it back with its history; it is disabled with a one-line reason when an active quest of the same vassal has taken its name meanwhile, or when 30 quests are already active. A restored quest is not put on today's board by itself: a recurring one joins the next board (still under the limit of two), and **Add to today** works as for any other.

### 1.4 Proposals

See section 5. On the Board, above the Compose button, a window "The Haven notices" lists each open proposal as a card: heading, the vassal and what it would add or change, the reason, and **Not now** / **Accept**. There is no badge, no count, no notification: if the player ignores them they quietly leave after a week.

---

### 1.5 Edit mode

The same sheet, opened from **Edit** with the saved quest as its starting point. What changes against composing: the title reads "Edit your quest", the sentence box and the microphone are gone, the habit, kind, minutes or count, name, a one-line **Note** (the description), how often (including a pinned weekday), time of day, where it happens, and effort are all shown prefilled, the reward preview is live as before, and the only buttons are **Cancel** and **Save changes** (no board buttons: an edit is for the next boards).

- **Effort.** The tier follows the effort (a longer timer moves it up, a shorter one down) unless the player picked one by hand; a hand-picked tier is kept through unrelated edits and always held to the cap of the kind and length (section 3).
- **Duplicate-title guard.** Another active quest of the same vassal with the same name is flagged at once, under the form, and **Save changes** waits. Names compare after one Unicode normalisation, with case, accents, spacing and invisible characters ignored, so "Café" typed as one character or as "e" plus a combining accent is the same name, and so is "cafe". The quest's own name is fine, and so is the same name under another vassal. Composing a new quest is guarded the same way. Archived quests do not count.
- **Today's board.** A daily quest is on every board, so it stays editable: an untouched copy on today's board takes the new shape in place, and a settled one keeps its snapshot. Only while the copy is *in progress* (its timer is running or holds time, its counter is above zero, or it was marked tried) are its vassal, kind, length and effort held: the controls are disabled, show what is saved, and a line says they wait until it is settled. See 4.2.
- A refusal from the engine (for example the quest was archived meanwhile) stays inside the sheet as an alert; nothing is lost.

## 2. Parser (`compose/parse.ts`)

`parseQuestDraft(transcript, { locale? }) => ParsedQuestDraft`. Pure, total (never throws, any string), deterministic, English and French in one grammar. `navigator.language` only breaks ties between languages (+0.1 per keyword hit in the player's language); both keyword tables are always tried, so a French player can say "walk the dog" and an English player "appeler maman".

### 2.1 Output

```ts
interface ParsedQuestDraft {
  transcript: string;
  habit: HabitId;                 // one of the 8; 'move' with low confidence when nothing matched
  kind: 'check' | 'timer' | 'count';
  durationMin?: number;           // 1..240, timers only
  targetCount?: number;           // 2..99, counters only
  title: string;                  // imperative, Title Case, <= 40 characters
  description: string;            // the original sentence, cleaned, <= 160 characters
  recurrence: 'once' | 'daily' | 'weekdays' | `weekly:${1..6}`;
  pinWeekday?: number;            // 0 = Sunday, with weekly:1
  timeSlot: 'any' | 'morning' | 'afternoon' | 'evening';
  tier: 1 | 2 | 3;                // effort tier (section 3)
  maxTier: 1 | 2 | 3;             // highest tier the kind/duration may claim
  confidence: { habit, kind, amount, title, recurrence, timeSlot };   // each 0..1
  questions: { id: 'habit' | 'amount' | 'title' | 'empty'; field }[]; // asked when a confidence is below 0.6
}
```

### 2.2 Pipeline

The sentence is held twice, with the same length: the original (case and accents, for the title) and a folded copy (lower case, accent-free, hyphens and apostrophes as spaces, for matching). Each step blanks the span it understood in both, so what is left becomes the title.

1. **Normalise.** Number words to digits ("twenty five", "vingt cinq", "quatre vingt dix", "soixante et onze"; "one", "un", "une" only before a time word), thousands separators ("10,000"), ranges keep their lower bound ("20-30 minutes" gives 20), "twice" and "thrice" become "2 times" and "3 times", "once a week" and "une fois" become "1 times" and "1 fois".
2. **Frequency**, first match wins in this order:
   - *N times a day/week*: `N (x|times|fois) (a|per|par|this|cette|every|chaque ...) (day|week|jour|semaine)`. A day gives a **daily counter** of N; a week gives `weekly:N` (7 or more gives `daily`); no period gives a counter of N.
   - *N days a week* / *N jours par semaine*: `weekly:N`.
   - *Every morning/evening/afternoon/night* and *tous les matins/soirs*, *chaque soir*: `daily` plus that slot.
   - *Weekdays*: weekdays, every weekday, Monday to Friday, du lundi au vendredi, en semaine, jours ouvres.
   - *Daily*: every day, daily, each day, everyday, tous les jours, chaque jour, quotidien, a day, par jour.
   - *Weekday names*: "every Monday", "on Saturdays", "chaque lundi", "tous les lundis", "le lundi" give `weekly:1` pinned to that weekday; a single "on Friday" or "this Friday" is a one-off; two or more names ("Tuesdays and Fridays") give `weekly:N` with no pin.
   - *Weekly*: weekly, every week, chaque semaine, hebdomadaire, a week, par semaine.
   - *One-off markers* (consumed, recurrence stays `once`): today, tonight, now, tomorrow, this week, this weekend, this morning, aujourd'hui, ce soir, demain, cette semaine, ce week-end.
3. **Time of day.** A clock time (`10pm`, `at 7:30`, `by 11pm`, `vers 18h`, `a 18h`) is read to a slot: 05:00-11:59 morning, 12:00-17:59 afternoon, otherwise evening. A bare "a 2h walk" is a duration, not a clock time ("a" counts as "at" only from 6 o'clock). Words win over a clock time: morning (in the morning, before breakfast, le matin, au reveil), afternoon (after lunch, lunchtime, noon, l'apres-midi), evening (tonight, at night, before bed, after dinner, le soir, avant de dormir, avant de me coucher). Two different slots ("morning and evening") give `daily` with slot `any`.
4. **Duration**, first match: an hour and a half, une heure et demie (90); half an hour, demi-heure (30); a quarter of an hour, quart d'heure (15); an hour (60); `H hours M min`; `1h30`; `1.5 hours` / `1,5 heure`; `N min`; `N seconds` (rounded up to a minute). Clamped to 1..240; a clamp lowers confidence and raises the "How long, or how many?" question.
5. **Count.** A number followed by a noun that is not a time word ("20 pushups", "8 glasses of water", "3 sets of squats", "5 km"). One is just a check (the number stays in the title); 2..99 is a counter; above 99 ("10000 steps") stays in the name and the quest is a check. A bare number with no noun is a counter with low confidence and raises the amount question. The count stays in the title ("Do 20 Pushups"); it is not consumed.
6. **Kind.** A duration makes a **timer** (even when a count is also present: "read 10 pages for 20 minutes" is a 20-minute timer); else a counter of 2..99 makes a **counter**; else a **check**.
7. **Habit.** Weighted keyword tables (section 2.3) matched on what is left, so recurrence, time and duration phrases do not vote. `confidence = 0.35 + 0.6 * (s1 - s2) / (s1 + s2 + 1)` from the top two scores; 0.15 and Move when nothing matched. Below 0.6 the sheet asks "Which vassal should take this one?".
8. **Title.** What is left: punctuation removed, leading filler stripped (please, I want to, I'd like to, I need to, remind me to, add a quest, my goal is to, je veux, je voudrais, il faut que je, rappelle-moi de ...), trailing connectors stripped (for, in, during, pendant, par, at, de, the, and ...), a leading article dropped when two or more words remain, Title Case with small words kept lower (a, the, of, in, de, la, le, des ...) and French elisions kept (`d'eau`), then cut to 40 characters at a word boundary. An empty result falls back to the habit's name with low title confidence and a "What should it be called?" question. Accents are kept ("Étudier le Français").
9. **Description.** The original sentence, whitespace collapsed, first letter capitalised, final full stop added, 160 characters at most.

### 2.3 Keyword tables (`compose/keywords.ts`)

About 530 patterns: 297 English and 237 French, per habit and language. Each entry is a whole-word regular-expression fragment with a weight: 3 names the habit outright, 2 a strong word, 1 a hint. They are code rather than content JSON because they are matched as regular expressions after folding; everything the player reads is still in `strings.json`.

| Habit | Examples (English / French) |
|---|---|
| Move | walk, run, jog, stretch, yoga, gym, workout, pushups, squats, plank, cycle, swim, dance, cardio, stairs / marcher, courir, footing, etirements, muscu, pompes, abdos, gainage, velo, natation, salle de sport |
| Outside | outside, outdoors, fresh air, sunlight, daylight, nature, balcony, terrace, around the block, leave the house, stroll / dehors, exterieur, air frais, soleil, balcon, terrasse, balade, promenade, sortir |
| Clean | clean, tidy, dust, vacuum, laundry, dishes, declutter, make the bed, trash, chores, water the plants / nettoyer, ranger, menage, aspirateur, vaisselle, lessive, poubelle, corvee |
| Social | call, text, message, friend, family, mom, dad, sister, grandma, coffee with, catch up, hang out, check in on / appeler, sms, ami, famille, maman, papa, cafe avec, prendre des nouvelles |
| Study | study, learn, read, book, pages, practice, lesson, homework, flashcards, French/Spanish..., code, journal / etudier, apprendre, lire, livre, devoirs, revision, langue, coder, pratiquer |
| Sleep | sleep, nap, bedtime, go to bed, lights out, wind down, wake up, alarm, meditate, screens off / dormir, sommeil, sieste, se coucher, au lit, reveil, se lever, mediter, sans ecran |
| Eat | eat, meal, breakfast, lunch, dinner, cook, recipe, water, glass, hydrate, fruit, vegetables, snack, groceries / manger, repas, petit dejeuner, cuisiner, eau, boire, hydrater, fruits, legumes, courses |
| Hygiene | shower, bath, brush, teeth, floss, shave, wash my face, skincare, get dressed, nails, hygiene / douche, bain, brosser, dents, fil dentaire, raser, se laver, visage, soin, s'habiller |

Ambiguity is intentional and visible: "walk 30 minutes in the park" scores Move 2 against Outside 1, confidence 0.5, so the sheet picks Move and asks. Specific phrases outweigh generic words ("water the plants" is Clean, "wash the dishes" is Clean, "clean the bathroom" is Clean).

### 2.4 Coverage

`compose/parse.test.ts`: 82 cases. The eight sentences of the brief, 24 single-habit keyword cases, 17 French sentences (accents, elision, `tous les`, `trois fois par semaine`, `chaque lundi`, `du lundi au vendredi`, `quart d'heure`, `une heure et demie`), durations (hours, half hours, ranges, seconds, clamp), counts (units, per-day counters, one, huge numbers, bare numbers, number words), recurrence (daily, weekdays, N days a week, pinned weekdays, two weekdays, morning and evening), time of day (words, clock times, precedence), title and filler stripping, Title Case and the 40-character limit, empty and nonsense input, confidence bounds, determinism, and tier caps.

---

## 3. Effort, tiers and the earning cap

Custom quests pay **exactly the shipped formula for their tier** (`questRewards` with the tier's `baseXp` and `baseCoins` from `quests.json`, Domain Points = tier, loyalty = gain + tier - 1, utility restore by tier, +10% timed bonus for a timer run to its length, difficulty multiplier, title multipliers). Nothing else is a custom special case. What keeps them from out-earning built-ins:

| Kind | Derived tier | Highest tier the player may claim |
|---|---|---|
| Timer | up to 15 min: 1; up to 30 min: 2; longer: 3 | the derived tier (the sheet can lower it, never raise it) |
| Counter | target 5 or less: 1; more: 2 | 2 |
| Check | 1 | 2 |

The shipped quests follow the same ladder (timers of up to 15 minutes are tier 1, 20-30 tier 2, 40-60 tier 3). A check or a counter cannot prove its effort, so it stops at tier 2 (shipped tier 3 checks are specific, heavy tasks). A tier 3 custom quest therefore always means a timer over half an hour. The tier is re-clamped on every create, update and migration, so a hand-edited save cannot raise it. A custom quest pays the *default* of its tier, which is at or below the best shipped quest of that tier. Other limits: at most **two** custom quests on any board in addition to the generated ones, at most **30** active templates, never the Bonus contract (`chooseBonus` only knows shipped templates).

---

## 4. Engine

### 4.1 Save v3

`SaveFile.version` is now `3` (`SAVE_VERSION`). `migrate` accepts v2 (and the legacy shapes) and adds empty arrays; every new field is sanitised on read (unknown habits, kinds and slots, out-of-range numbers, duplicate ids, a recurrence of `weekly:9`, over-long titles, a tier above the cap all repair themselves). Board quests whose template is gone are dropped like unknown shipped templates.

```ts
interface SaveFile {
  // ...v2 fields...
  customTemplates: CustomTemplate[];
  proposals: Proposal[];
  activity: ActivityDay[];      // addition not in the brief: see 4.4
}
interface CustomTemplate {
  id: string;                   // 'c-' + 8 hex digits of fnv1a(`${now}:${habit}:${title}`), made unique; never reused
  habit: HabitId; kind: QuestKind;
  durationMin?: number; targetCount?: number;
  title: string; description: string;
  tier: Tier;
  recurrence: 'once' | 'daily' | 'weekdays' | `weekly:${n}`;
  pinWeekday?: number;          // 0..6, with weekly:1
  timeSlot: 'any' | 'morning' | 'afternoon' | 'evening';
  createdAt: number; archivedAt?: number;
  source: 'voice' | 'text' | 'proposal';
  stats: { issued: number; done: number; tried: number };
}
```

`BoardQuest.templateId` of a custom quest is its `c-...` id; `instanceId` is `${day}-${templateId}` like any quest, so `changeResetHour` shifts it unchanged. `resolveTemplate(save, id)` (in `template.ts`) is the one lookup: `c-` ids resolve in `customTemplates` (archived ones too, so a settled quest stays settled and undoable), everything else in `quests.json`. It replaced every `getQuest(q.templateId)` on a board quest. The store's persist envelope version is unchanged (the envelope shape did not change; `migrate` does the upgrade).

### 4.2 `custom.ts`

All mutators are `(save, now, ...) => { save, events, error?, templateId?, instanceId? }`, input never mutated.

- `cleanDraft(draft)`: validation and normalisation shared by every path (title 1..40, timer 1..240 minutes, counter 1..99, recurrence, slot, tier clamp, pin only with `weekly:1`).
- `addCustomTemplate(save, now, draft)`: refuses a duplicate name within a habit (case-insensitive, active templates) and the 31st active template. Event `customSaved`.
- `updateCustomTemplate(save, now, id, patch, opts?)`: accepts every editable field (title, description, habit, kind, duration or count, tier, recurrence, pinned weekday, time slot, outpost). The patch is merged over the stored template and validated by `cleanDraft`, so the **tier is re-capped by the same effort rules as a new quest**: it follows the effort unless the patch sets one, and a requested tier never exceeds the cap of the resulting kind and length (a check or counter stops at 2, a timer at its own effort). Fields of the old kind are cleared; a pin is kept only with `weekly:1`; `outpostId: null` clears the outpost, and an outpost retired since is let go quietly. Refusals: unknown or archived template, an invalid field, a name another active quest of the same habit carries (`customTitleTaken`), an unknown outpost, and **a change to habit, kind, length, count or tier while today's copy is in progress**. Event `customUpdated`.
- **Edits are for future boards, and for the copy on today's board only while nothing has been paid or started on it.** Recurrence, placement and every new copy read the template as it is then. For today's copy, the board quest stores its own habit and kind and the reward snapshot is taken at settlement, so: an *untouched* open copy takes the new habit, kind, length, count and tier in place (the board quest is rebuilt to match, and a habit change is refused when that vassal is away or the habit is off); a *settled* copy keeps its stored snapshot and its stored habit and kind, and undo reverts the snapshot, not the current template; a copy *in progress* (`customCopyInProgress`: a running timer or one with time on it, a counter above zero, or tried) holds its shape, and a change to habit, kind, length, count or tier is refused with "it is in progress on today's board; change its habit, kind, length or effort once it is settled" (a tried copy counts as in progress because finishing it later pays from the live template). Name, note, time slot, recurrence and outpost never change a payout and always go through, and the card shows the new name. The hold does not depend on the board being today's, so a stale board cannot be used to slip a new shape under a started copy. A patch that sets a recurrence without a pinned weekday clears any pin ("Every Wednesday" back to "Once a week").
- `archiveCustomTemplate(save, now, id)`: sets `archivedAt`, takes an untouched open copy off today's board, keeps worked-on copies. Event `customArchived`.
- `restoreCustomTemplate(save, now, id, opts?)`: the reverse. Clears `archivedAt` and changes nothing else (history, stats, settings, source). It does not touch today's board; the **max-two-per-board rule applies on the next issue**, because a restored recurring template competes for the two places like any other (fairest first), and "Add to today" is refused with the usual line when two are already there. Refused when the template is not archived, when an active quest of the same habit now carries its name, and at 30 active quests; an outpost that was retired meanwhile is dropped from it. **No schema change**: `archivedAt` already existed. The event union lives in `types.ts`, which this change does not edit, so there is no `customRestored` event: restore reports `customUpdated` (toast: "<name> is updated."), and the log line has kind `customRestored`.
- `customTitleTaken(save, habit, title, exceptId?)`: the duplicate-title test shared by add, edit, restore and the sheet's live warning.
- `addCustomQuestToBoard(save, now, id)`: puts today's copy at the end of the board, `stats.issued += 1`, never touches `bonusId`. Refuses: no board for today, habit disabled, vassal away, already on the board, two custom quests already there. Event `customBoarded`.
- `previewCustomRewards(save, draft)`: what the draft would pay now (no timed bonus), for the sheet.
- `placeRecurringDraft(draft, day, now)`: called by `issueBoardDraft` after the generated board exists.

Custom quests behave as ordinary quests in `board.ts`: `completeQuest` snapshots rewards, restores utilities (a custom Sleep quest feeds Power), raises vassal XP, loyalty, trust and `lastActiveDay`, updates stats, combos and titles; `undoQuest` reverts exactly; `markTried` counts for trust. Template stats follow: `done` +1 on completion and -1 on undo, `tried` +1 on "tried" and -1 when it is later finished. `rerollQuest` refuses custom quests. `refillEmptyBoardDraft` (a vassal returns to an empty board) keeps the custom quests already on it.

### 4.3 Recurrence

`recurrenceDue(template, day)`; weekday of a game day is `(day + 4) mod 7` (day 0 was a Thursday; 0 = Sunday):

- `once`: never. `daily`: always. `weekdays`: Monday to Friday.
- `weekly:1` with `pinWeekday`: only that weekday.
- `weekly:N` otherwise: N days spread over the week from a per-template offset `fnv1a(id) mod 7`: day `d` is due when `(weekday(d) - offset) mod 7` is one of `floor(i * 7 / N)` for `i < N`. Stateless (no history needed), exactly N per week, evenly spaced (N = 3 gives 0, 2, 4), and different templates land on different days.

At the next board (`issueBoardDraft`, once per day), due templates of enabled habits with a present vassal are appended up to the two-per-board limit, fairest first (least `stats.issued`, then oldest). A third recurring quest therefore rotates in on the following days. No event is emitted (the `boardIssued` event covers it).

### 4.4 Activity history

The proposal rules need the past, and the save only holds today's board. `SaveFile.activity` keeps one entry per settled day that had at least one done or tried quest (`{ day, entries: [{ templateId, habit, status: 'done' | 'tried' }] }`), the last 42 days. It is written at the day boundary (`recordActivityDraft`, step 1 of `processDayBoundaryDraft`, before the board is replaced; undo is same-day so entries are final) and shifted by `changeResetHour` together with proposal days. Existing players start with no history, so rules begin to fire after enough new days: that is the safe direction (no spurious suggestions).

---

## 5. Adaptive proposals (`adapt.ts`)

Computed at the day boundary: `processBoundaries` calls `computeProposalsDraft` once per newly issued board (never on a plain re-open). `evaluateProposals(save, today)` is pure and yields every proposal the rules would make today, in priority order, one per habit; `computeProposalsDraft` merges them under the limits.

### 5.1 Rules

"Last 7 days" is the seven settled days before today. Only enabled habits whose vassal is present are considered.

| # | Rule | Fires when | Proposal |
|---|---|---|---|
| 1 | `smaller` | the habit has a tried quest and no done quest in the last 7 days | A smaller version of its most-tried template (next most tried when one cannot shrink): tier down, timer duration halved (minimum 5), counter halved (a counter halved to 1 becomes a check). Title "<name> (Mini)", once, added to today's board on accept. |
| 2 | `stepUp` | done on 5 or more distinct days of the last 7, and at least 7 days since first play | A step up from its most-done template: timer x1.5 rounded to 5 and capped at 120 minutes, counter x1.5, check one tier up. Capped by the tier rules (a check stops at 2); nothing is proposed when it cannot go higher. Title "<name> (Plus)", once, added to today's board. |
| 3 | `makeRecurring` | an active custom template with recurrence "once" has `stats.done >= 3` | Update its recurrence: `daily` when it was done on 8 or more of the last 14 days, otherwise `weekly:2` to `weekly:4` from the number of days done. |
| 4 | `footInDoor` | an enabled habit has no done quest in 14 days, and at least 14 days since first play | A warm 5-minute check quest from `strings.proposals.footInDoor.titles[habit]` ("Five Minutes of Moving", "Step Outside for Five", "Send One Small Message", ...), tier 1, "Five minutes, no more. Stopping early counts." Added to today's board. |
| 5 | `pinWeekday` | the habit was done on the same weekday on each of the last three occurrences of it, at least 21 days since first play, and not on 5 or more of the last 7 days | Pin to that weekday (the weekday with most evidence): updates the custom template, or creates a weekly:1 copy of the shipped one (not added today). |

Priority when habits compete for the three slots: 1, 3, 2, 5, 4: help for a struggling habit first, then what rewards a going one, and the five-minute door-openers last, so a long absence never opens with a pile of them. (The design brief numbered the rules 1 to 5 in a different order; the numbers above follow the brief, the order is the priority.)

### 5.2 Limits and quiet

- At most **3 open** at any time; at most one per habit.
- Open proposals persist from day to day with the same id (no churn); one whose condition stopped holding is dropped without a snooze.
- An open proposal nobody answers leaves after **7 days** and its rule + habit stays quiet for 7 more.
- **Not now** or **Accept** silences that rule + habit for **7 days** (`snoozeUntil = today + 7`; it may return on the 7th day if the pattern still holds). Answered records are kept only until their snooze ends.
- No notifications, no badges. The UI is a card list on the Board and nothing else.

### 5.3 Answering

`acceptProposal(save, now, id)` goes through `addCustomTemplate` + `addCustomQuestToBoard` (create) or `updateCustomTemplate` (update), the same functions as the Compose sheet. If the board already holds two custom quests (or the habit is off) a created template is still saved and starts tomorrow. Rule 3 (`makeRecurring`) is an `update` action: accepting calls `updateCustomTemplate` with the new recurrence on the **same template**, never a copy, so its id, history and stats carry on and the Board card says "Updates your saved quest. No copy is made." (A pinned-weekday proposal for a custom template is an update too; only a shipped quest is copied, because it is not the player's to edit.) A recurrence proposal is only made for a "once" quest; if the player has set a recurrence themselves since, accepting the old card lets it go quietly (answered "not now") instead of undoing their edit. If accepting fails (30 templates, duplicate name, archived template) the proposal stays open and the player gets the refusal. `dismissProposal(save, now, id)` only snoozes. Store events collapse to one toast per answer (`oneToastFor`).

Copy is reason-first, never a verdict: "You tried your Move quests 2 times this week and finished none. Trying counts, and a smaller version can be easier to finish: ...", "It has been quiet on Study for two weeks, and that is allowed. ...". Two variants per rule, picked by a seed so a re-render keeps the same line.

---

## 6. Voice (`useSpeechRecognition`)

`window.SpeechRecognition || window.webkitSpeechRecognition`, looked up at call time. Language is `navigator.language`. `interimResults = true`, `continuous = false` (one phrase per press, the browser ends the session). A fresh recogniser per start (iOS Safari quirks), aborted on unmount, so closing the sheet always releases the microphone.

States and what the sheet does:

| State | Cause | UI |
|---|---|---|
| unsupported | No constructor (Firefox, some iOS builds) | No microphone button; "This browser cannot listen. Type it instead." |
| idle | | "Speak it" button |
| listening | `start()` ok | "Stop" button, "Listening..." with a pulsing square, live "Hearing: ..." |
| denied | `not-allowed`, `service-not-allowed` | Alert "The microphone is blocked. Type it instead, or allow it for this site in your browser settings."; focus goes to the textarea |
| no microphone | `audio-capture` | Alert, text box focused |
| nothing heard | `no-speech` | Alert, try again or type |
| offline | `network`, `start()` throwing, any other error | Alert "The speech service could not be reached. Type it instead." |

The text path is always there; voice only fills the same textarea.

---

## 7. Privacy

- The parser runs entirely on the device. No request is made by Compose, by the parser, by recurrence or by proposals.
- Audio is never recorded, stored or saved by Haven. The only thing kept is the final transcript, which the player sees and can edit before anything is saved; the saved quest keeps the cleaned sentence as its description.
- Where the browser's speech recognition is network-based (Chrome sends audio to its maker's service while online; Safari and Edge have their own arrangements), that is the browser vendor's service, not Haven's. The sheet says so next to the microphone: "Voice typing uses your browser's speech service. In Chrome that can mean your audio is sent to its maker while you are online. Haven records no audio and keeps only the text you see here. Nothing else leaves your device."
- The save (custom templates, proposals, activity) lives in `localStorage` like the rest, and exports and imports with the save file.

---

## 8. Accessibility

The sheet is a native modal dialog (focus trap, Escape, labelled by its title); every control has a visible label; the vassal, kind and tier pickers are real radio groups (arrow keys, grouped under legends) laid invisibly over their styled labels with a visible `:focus-within` ring; targets are at least 44 px (`--touch-target`); colour is never the only signal (selected options carry a border and the radio state, questions are text, the recording state is text plus a square); the interim transcript is `aria-live="polite"`, microphone failures are `role="alert"`; the recording pulse is disabled under `prefers-reduced-motion` and the in-app reduced-motion setting; tokens only, `minmax(0, 1fr)` grids, rem sizes, internal scroll with `max-height` in `dvh` (checked at 320x568, 390x844 at 150% text and 844x390).

---

## 9. Tests

- `custom.test.ts` (64): update of every field, the tier re-cap on edit, edits applying to future boards only (today's copy keeps its snapshot and its exact undo, the shape taking effect once the board has moved on, a recurring quest edited today placed as edited tomorrow, a stale board holding nothing), the duplicate-title guard, restore (clears `archivedAt`, history kept, refusals for not archived / name taken / 30 active, a gone outpost let go, recurring templates and the two-per-board limit after a restore), and effort and caps, validation, add / update / archive / board, behaviour as an ordinary quest (timer with timed bonus and exact undo, counter, Sleep restoring Power, tried, no swap), recurrence (daily, weekdays, `weekly:N` exactly N per week, pinned weekday), two-per-board rotation, determinism, migration of a board holding a custom quest.
- `adapt.test.ts` (39): each of the five rules with constructed saves (fires, boundaries, gating by days since first play, other habits, off or away habits), priority and one-per-habit, the three-open limit, no churn, the 7-day snooze, expiry of unanswered proposals, accept (create and board, board full, update), failed accept keeps the proposal, boundary archiving of activity, 42-day cap, `changeResetHour` shifting.
- `save.test.ts`: v2 to v3 migration (empty arrays), idempotent round trip of all three new arrays, sanitising of corrupt entries; every existing migration test still passes.
- `compose/parse.test.ts` (82), `ComposeQuestSheet.test.tsx` (23: text path, edits, caps, errors, the voice path with a mock `SpeechRecognition` including the unprefixed and `webkit` constructors, interim and final results, every error code, `start()` throwing, abort on close, and the unsupported fallback), `screens/CustomQuests.test.tsx` (9: Board button, card, proposals, My quests) and `components/CustomQuests.test.tsx` (15: Edit opens the prefilled sheet and Save changes applies every field, a hand-picked tier kept, validation, the duplicate-title warning and Cancel, the held shape of a quest on today's board, an engine refusal staying in the sheet, the collapsed Archived group, Restore and its disabled reason, newest first, and a rule 3 proposal updating the quest without a copy). Rule 3 is also tested in `adapt.test.ts`: same id, same stats, no copy, and an archived quest refused with the proposal left open.
- `e2e/compose.spec.ts` (10 scenarios x 2 viewports): the text path end to end (type, parsed fields, add, complete, undo, archive), a recurring quest returning on the next days, the voice path with a fake recogniser, the unsupported fallback, a refused microphone and Escape, a proposal appearing after tried-only days with the debug clock (dismiss, accept, snooze holds), axe on the sheet, the Board and the Ledger, and, for edit and restore: an edit saved today and tomorrow's board (debug clock) showing the new name and length, the held shape of a quest that is on today's board, a duplicate name refused in the sheet, and archive then Restore from the collapsed group with the quest back on the next day's board (axe on the edit sheet and on the open Archived group).

---

## 10. Limitations

- **Speech support is uneven.** Chrome and Edge (desktop and Android) work and send audio to a cloud service. Safari has the prefixed API but it can be unavailable or flaky in standalone PWAs on iOS. Firefox has none. Without it the sheet is text only, which is a complete path. Recognition quality and punctuation depend on the browser; numbers may arrive as words or digits (both are parsed).
- **The parser reads one sentence about one quest.** No multiple quests in one sentence ("call mom and tidy the kitchen" becomes one quest), no dates ("on the 12th"), no "every other day", no month frequencies, no units conversion (5 km is a counter of 5). Habit detection is keyword-based: a new word is simply unknown (Move, low confidence, the sheet asks). Only English and French.
- **Proposals read at most six weeks of history** and only from the boards it recorded; existing players have no history until they play on this version. Proposal reasons are stored in English at the moment they are made.
- **A count of weekly quests is spread, not chosen**: `weekly:N` places N days per week by a fixed offset; the player cannot pick the days except with the single pinned weekday.
- **A started copy holds its shape until it is settled** (the board copy has no frozen shape of its own without a schema change): a player who wants a longer timer for a quest they are already running adds a new quest, or edits it once it is settled. Name, note, time of day, how often and where change at once, and an untouched or settled copy takes every other change.
- **Restore has no event of its own** (the event union is part of the save schema file, which this change leaves alone): it reuses `customUpdated`, so its toast reads "<name> is updated.", like an edit's.
- The time slot is stored and shown but does not reorder the Board.

## 11. Future work (not implemented)

- **Optional LLM adapter, behind a user-supplied key.** A `ParserAdapter` interface (`(transcript, locale) => Promise<ParsedQuestDraft | null>`) in the store layer, off by default, enabled in Settings by the player pasting their own API key, held only in the browser, with an explicit "this sends your sentence to <provider>" confirmation. The rule-based parser stays the default and the fallback on any error, timeout or offline state, and the adapter's output goes through the same editable fields and `cleanDraft` (so the tier cap and limits apply identically). It would be added in `src/state` and `src/screens`, never in the pure engine. **Not implemented.**
- Reorder by time slot; a dedicated restore event and toast; letting a copy that is on today's board take a new shape through a frozen copy of its fields on the board quest (needs a schema change); "every other day" and month frequencies; a Settings switch to turn proposals off; localised proposal text from stored reason keys; on-device speech models where the platform offers them.
