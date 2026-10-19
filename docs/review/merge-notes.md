# Merge notes (wave 1)

Needs and departures the briefs could not resolve inside the files they own. One section per brief letter; the merger applies them.

## B. Edit and restore custom quests

Two files outside the brief's list had to change for the feature to work at all. Both edits are small and additive; if brief A (or anyone) changed the same lines, keep both sides.

- `src/state/gameStore.ts`: the only place that may call engine mutators (CLAUDE.md), so the two new engine functions need store actions. Added `editCustom(templateId, draft)` (calls `updateCustomTemplate`, returns false with a notice when refused) and `restoreCustom(templateId)` (calls `restoreCustomTemplate`), next to `archiveCustom`, plus the two imports and the two lines in `GameActions`.
- `src/game/index.ts`: re-exports `restoreCustomTemplate` and `customTitleTaken` next to the other `./custom` names.
- `src/screens/CustomQuests.test.tsx` (an older screen test, not in the list): one assertion changed. It expected an archived quest's heading to vanish from the Ledger; archived quests now sit under the collapsed "Archived" group, so it checks the empty note and the group instead. New screen tests are in `src/components/CustomQuests.test.tsx`, as the brief says.

Departures from the brief:

- **No `customRestored` event.** `GameEvent` lives in `src/game/types.ts`, which this wave does not edit, so `restoreCustomTemplate` reports `customUpdated` (the existing event; its toast reads "<name> is updated and in My quests."). The log entry has kind `customRestored`. If brief A ever extends the event union, switching restore to its own event is a three-line change (`custom.ts`, `eventText.ts`, `gameStore.ts` `SHOWN_EVENTS`).
- **Today's copy keeps its shape by refusal, not by a frozen copy.** The board quest has no tier, duration or count of its own and `BoardQuest` is in `types.ts`, so an edit to habit, kind, length, count or tier is refused ("from tomorrow") while the template is on today's board. Name, note, time slot, recurrence and outpost change at once, and the settled reward snapshot is unaffected.
- `src/game/README.md` (module map, `custom.ts` row) could list `restoreCustomTemplate` and `customTitleTaken`; it is not in this brief's list.
