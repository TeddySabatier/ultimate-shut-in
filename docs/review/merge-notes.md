# Merge notes (wave 1)

Needs and departures the briefs could not resolve inside the files they own. One section per brief letter; the merger applies them.

## B. Edit and restore custom quests

Two files outside the brief's list had to change for the feature to work at all. Both edits are small and additive; if brief A (or anyone) changed the same lines, keep both sides.

- `src/state/gameStore.ts`: the only place that may call engine mutators (CLAUDE.md), so the two new engine functions need store actions. Added `editCustom(templateId, draft)` (calls `updateCustomTemplate`, returns false with a notice when refused) and `restoreCustom(templateId)` (calls `restoreCustomTemplate`), next to `archiveCustom`, plus the two imports and the two lines in `GameActions`.
- `src/game/index.ts`: re-exports `restoreCustomTemplate`, `customTitleTaken` and `customCopyInProgress` next to the other `./custom` names.
- `src/screens/CustomQuests.test.tsx` (an older screen test, not in the list): one assertion changed. It expected an archived quest's heading to vanish from the Ledger; archived quests now sit under the collapsed "Archived" group, so it checks the empty note and the group instead. New screen tests are in `src/components/CustomQuests.test.tsx`, as the brief says.

Departures from the brief:

- **No `customRestored` event.** `GameEvent` lives in `src/game/types.ts`, which this wave does not edit, so `restoreCustomTemplate` reports `customUpdated` (the existing event; its toast reads "<name> is updated.", like an edit's). The log entry has kind `customRestored`. If brief A ever extends the event union, switching restore to its own event is a three-line change (`custom.ts`, `eventText.ts`, `gameStore.ts` `SHOWN_EVENTS`).
- **Today's copy keeps its shape while it is in progress, not by a frozen copy.** The board quest has no tier, duration or count of its own and `BoardQuest` is in `types.ts`. So a change to habit, kind, length, count or tier is refused only while today's copy is in progress (running timer or time on it, counter above zero, or tried); an untouched copy takes the new shape in place and a settled one keeps its stored snapshot. A daily quest is therefore editable every day. Name, note, time slot, recurrence and outpost always change at once. One deviation from the review's suggestion: a *tried* copy is held too (the review text says "settled (done or tried)"), because a tried copy has no reward snapshot and would pay the new tier if finished later.
- **Out-of-date proposals.** Accepting a recurrence proposal for a quest that is no longer "once" lets the card go (answered "not now") instead of overwriting the player's edit. Proposals are still not retired the moment the player edits the quest; they leave on accept or at the next day boundary.
- **Duplicate names** compare after Unicode normalisation with case, accents and invisible characters ignored ("Cafe" and "Café" clash); this also applies to adding a new quest.

Review items not done: none skipped. The "restore toast reads like an edit" point (m4) stays as a documented departure.

`src/game/README.md` (module map, `custom.ts` row) could list `restoreCustomTemplate`, `customTitleTaken` and `customCopyInProgress`; it is not in this brief's list.
