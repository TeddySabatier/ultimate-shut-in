# Merge notes for wave 1

Each brief records here what the merger must do outside the files that brief owns.

## C. Reminders and app shortcuts

**One line to add to `src/screens/QuestsScreen.tsx`** (not owned by brief C). Import the hook and call it right after the `composing` state, so `#/quests?compose=1` (the "Add my own quest" shortcut) opens the compose sheet:

```tsx
import { useComposeDeepLink } from '../notifications/useDeepLink';

// directly below: const [composing, setComposing] = useState(false);
useComposeDeepLink(() => setComposing(true));
```

The hook calls the callback once when `?compose=1` is in the hash and removes the parameter (`replace`), so a refresh does not reopen the sheet. Until the line is added the shortcut still opens the Board, which is the safe fallback.

Other things to know when merging:

- `src/game/content/strings.json`: the `reminders` key is appended after `map`. If another branch also appends at the end of the file, keep both keys; nothing else in that file changed.
- `src/main.tsx` and `src/App.tsx` are untouched. The reminder runtime starts from `registerSW()` in `src/pwa/registerSW.ts`, which `main.tsx` already calls.
- Reminder preferences are device-level and live in `localStorage` key `haven.reminders`, not in the SaveFile (`types.ts` and `save.ts` are reserved), so there is no migration. They are not part of Export save.
- "Wave tomorrow" fires at its time on the last game day of a wave period (the wave settles at the next reset hour). The brief said "the day before a wave period ends"; the last game day is the evening on which the wave really is tomorrow. One constant, `dayInWavePeriod(...) !== 6` in `src/notifications/scheduler.ts`, changes it to the day before.
- The `Map` shortcut targets `#/map`, which exists on main since the Map tab merged.
