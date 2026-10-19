# Game: Roguelike Chess (`roguelike-chess`)

| | |
| --- | --- |
| Category | `strategy` |
| Minimum ring | 2 |
| Roster | 3 to 8 troops |
| Estimated minutes | 3 |
| Priority | 1 (the flagship) |

## Idea

A tiny turn-based tactics game on a 6x6 board that borrows how chess pieces move. **The player's troops are the pieces**, the enemies are the wave monsters, and between three rooms the player picks one of three upgrades. It is the template for "a real game with the party as the pieces".

## Rules (finalise the numbers, keep the structure)

- Board 6x6. The player moves **one piece per turn**, then every enemy acts. No timer. Seeded: the room layouts, enemy picks and upgrade offers come from the seed.
- **Each troop is a piece, chosen by habit:** Move = knight (L-shaped jump), Outside = bishop (diagonal slide), Clean = rook (orthogonal slide), Social = queen-lite (any direction, up to 3 squares), Study = king (one step any direction; the Study troop also gives hints), Sleep = pawn wall (one step forward or sideways, blocks), Eat = rook-lite (orthogonal, up to 2), Hygiene = bishop-lite (diagonal, up to 2). A party smaller than 8 uses only the troops it has; a missing habit simply has no piece. Troops that are not in the habit list (future citizens) use the pawn wall.
- **Combat is simple and readable.** Moving onto an enemy square attacks it: damage = the piece's attack; enemies and pieces have HP. Attack and HP derive from `level`; `loyalty` above 70 adds +1 attack; each earned title in `traits` gives the piece one named passive (design 8 passives, document them).
- **Enemies** are the wave monsters (clutter blob, procrastination moth, doomscroll wyrm, dust bunny, snooze golem, couch leech, fog wraith, junk-food imp, silence specter; the Static as the room-3 boss). Each has a small scripted behaviour (advance, slide, jump, split, drain). Enemy choices are deterministic given the state and the seed's tie-breaks.
- **Three rooms.** Room 1 two or three weak enemies, room 2 four mixed, room 3 the boss with minions. After rooms 1 and 2 the player picks **one of three upgrades** (12 upgrades: for example +1 attack to one piece, heal everyone, a piece moves twice once per room, swap two pieces, shield the weakest, a fallen piece returns once, +1 range). Win: clear room 3. Loss: every piece is lost, or 40 turns pass in a room.
- `run.difficulty` changes enemy count and HP. Buffs: `attack` +1 damage per 10 points, `defense` extra HP, `revive` brings back one fallen piece once, `hint` highlights the best capture, `time` extra turns before the turn cap, `luck` improves upgrade offers.
- **Score** 0 to 1000: rooms cleared, pieces surviving, turns used. `result`: won, lost, or fled.

## Interface

Tap or click a piece, legal squares light up, tap one to move. Keyboard: arrows move a cursor, Enter selects and confirms, Escape cancels. A log line for every action (`aria-live`). The enemy's next intention is shown on the board (a small marker), so the game is a puzzle, not a surprise.

## Optional stretch (AI literacy, only if everything else is done)

A toggle "Show how the enemy thinks" that lists, for the boss, the two or three moves it considered and why it picked one (a plain-language minimax-style explanation). Do not add a real search engine to make this work; explain the scripted rule.

## Acceptance

- A bot that plays greedily wins 40 to 70 percent on difficulty 3 over 200 seeds (assert a range in a test), always terminates, and replays identically.
- Every piece type's legal moves have exhaustive unit tests (edges, blocking, capture).
- All 12 upgrades and all enemy behaviours are unit-tested.
- A complete game takes under three minutes of human play.

## Cut line (cut in this order)

The optional stretch, then titles-as-passives (keep one generic passive), then the upgrade count (keep 8), then enemy variety (keep 5 monsters).
