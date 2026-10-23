# Ideas: learning inside the roguelike (scouting pass)

Status: ideation only, 2026-10-23. Nothing here is specified or scheduled. Scope: the Arena run loop (`docs/design/ARENA.md`) and above all Roguelike Chess (`docs/games/roguelike-chess.md`), with the plug-in contract (`docs/design/games/CONTRACT.md`) as the boundary. The contract already has two hooks worth remembering: `manifest.learning` (a declared skill and concept list) and `Outcome.learned` (a topic and a one-line note the host can show and store). Every idea below fits through those two hooks or through the run's Lottery; none needs a new save version to be prototyped.

## 1. The tension

A roguelike earns its fun from three things: short runs with real stakes, decisions under uncertainty that reward mastery, and a fantasy where the player is the clever one. Learning content pulls the other way: it wants repetition, pauses to reflect, explicit feedback, and a difficulty curve set by the subject rather than by the seed. Bolt a lesson onto a run and the run stops being a run: the pacing breaks, the player feels tested instead of trusted, and the fantasy becomes "I am a student" again, which is exactly what someone opening a game at the end of a hard day does not want.

The way through is to make learning the *source* of power rather than a *toll* on the way to it. Roguelikes already teach: Into the Breach teaches tactics by showing every enemy intent, Slay the Spire teaches probability through deck composition, and both let the player feel the lesson as a win rather than read it as a tip. Roguelike Chess already shows monster intents and asks for one good move per turn. That is a tactics lesson with the lesson hidden. The question is how far the same trick carries: into the game's own depth first, into real-world skills second, and into what the player's habit data says about them third.

Two constraints from the GDD are non-negotiable: nothing in the Arena may touch streaks, trust, loyalty or utilities, and nothing may shame. A loss is "the troops come home".

## 2. Ideas

Format per idea: mechanic / what the player learns / why it stays fun / build cost (S, M, L) / risk.

### A. Learning the game itself

**A1. Replay the turn.** After a lost room, offer "see the turn that mattered": the engine replays the state from the seed and highlights the move where the bot would have diverged, with the intents visible. One tap, skippable, no text beyond the move. / Tactical reading: which capture to take, which intent to dodge. / It is a revenge tool, not a lecture: the player sees the escape they missed and wants the next run. / S (the engine is deterministic; `botPlay` exists). / Players may feel judged by the bot's move; frame it as "another line", never "the right move".

**A2. Named patterns as unlockable upgrades.** When the player performs a recognisable tactic (a fork with the knight, a pin with the rook, a wall that blocks two intents), the run logs it by name and, after three sightings across runs, a 13th upgrade card appears that strengthens that pattern. / Vocabulary and recognition of tactical motifs. / Naming something you already did feels like being seen, and the card is a tangible reward. / M (pattern detection on board state, a few upgrades). / Detection false positives cheapen the names; keep the set to five or six crisp motifs.

**A3. The Study king's hint becomes a question.** Instead of lighting the best capture outright, the king lights two candidate squares and asks "which?" with no penalty for a wrong tap: the right one glows, the wrong one shows the intent it would have walked into. / Evaluation of candidate moves. / It turns a passive buff into a tiny guess with instant payoff; wrong answers cost nothing but reveal something. / S. / Slows the turn; make it opt-in per run and only when the Study piece stands.

**A4. Daily seed with a shared solution.** One fixed seed per day, the same board for everyone, three rooms; after the run the player sees the bot's score and, if they beat it, a one-line note of what the bot did worse. / Planning over a whole room, comparing lines. / Daily challenges are the most replayed mode in every roguelike; a known opponent (the bot) gives a target without a leaderboard. / S (seed from the date; the bot already plays). / Without a leaderboard the comparison may feel thin; the bot must have personality in its log lines.

### B. Learning real-world skills through runs

**B5. Lore drops as upgrade flavour.** Each upgrade card gets a one-sentence fact tied to its name (Field kit: how field medicine triages; Borrowed time: the planning fallacy), drawn from a small original fact deck, different each run, never required reading. / Trivia-level general knowledge, lightly. / Zero friction: the fact rides on a card the player is already reading; curiosity is optional. / S (content only). / Easy to do badly: facts must be accurate, short and not preachy. A reviewer pass per deck.

**B6. The Archivist room.** One optional room type between rooms 2 and 3: the Study piece finds a scroll with a single recall question drawn from the player's own Word Forge or Memory Palace history (a word they missed, an item they forgot). Right answer: a small shield for the boss room. Wrong or skipped: nothing. / Spaced retrieval of material the player chose to learn elsewhere. / It links games the player already plays, the reward is real in the run, and skipping is free. / M (needs cross-game recall of `Outcome.learned` or a tiny shared store). / Becomes a quiz wall if the room is mandatory or the shield is big; keep it one question, always skippable.

**B7. Monsters that teach their counter.** Each monster's description, shown on long-press, states its real-world namesake in one line (the Doomscroll Wyrm "slides two squares toward whatever moves", the Snooze Golem "only acts every other turn: it is beatable by rhythm") and the tactical counter. / Metaphoric self-knowledge: procrastination, doomscrolling and snoozing as patterns with counters. / Flavour the player seeks out, not a pop-up; discovering a counter is a strategy win. / S (copy). / Heavy-handed metaphors read as a sermon; keep the tone dry and the counter mechanical.

**B8. The run's lesson note.** Every run already can return `Outcome.learned`. Make Roguelike Chess fill it with the single tactical fact the run proved (for example "a wall piece blocked three intents this run"), and let the Arena show the last five notes as a small "field notes" list. / The player's own emergent lessons, recorded in their words-ish. / Reading your own progress log is satisfying and costs no play time. / S. / Generated notes can be bland; derive them from real counts in the run, never from templates alone.

### C. Learning from the player's real-life habit data

**C9. Party portraits say why they are strong.** On the party builder, each piece's card explains its stats from the save: "Pell is a 6-attack knight because Move is level 12 and loyalty is 80". / The link between habits done and power held, made explicit once. / It is the Arena's whole fantasy stated plainly; players chase the number they can see. / S (the data is already in `PartyMember`). / Must never show a *drop*; stats only ever rise or hold, as the GDD requires.

**C10. The quiet vassal's room.** If a habit has had no completed quest in 14 days (the activity archive knows), its piece arrives in the run as a "lite" version with one line of in-character flavour ("Wren has not been outside much lately, so the bishop moves two") and a run-only upgrade that restores it for this run. / Awareness of which habit went quiet, without numbers or blame. / The weakness is diegetic and fixable inside the run, so it reads as a puzzle, not a reproach. / M (archive lookup in the host, a piece variant). / This is the most dangerous idea in the list: it edges toward shaming. Only ship it in Benevolent-friendly wording, never with a counter, and never affecting loyalty.

**C11. Habit-shaped daily seed.** The daily seed's monster pool leans on the player's weakest habit of the week: skipped Sleep means more Snooze Golems, skipped Social more Silence Specters. The run never says so; the player may notice. / Pattern recognition about their own week, discovered rather than told. / Noticing it yourself is the delight; the game stays silent. / S (seeded pool weights from the archive). / If never noticed it does nothing; if noticed too clearly it feels like surveillance. Keep the lean small.

**C12. Post-run reflection card, optional.** After a run, one optional card: "What did you do today that made Pell this strong?" with a free-text field saved to the quest notes (brief H, save v5). No reward. / Linking effort to outcome in the player's own words. / Costs nothing, skippable, and the Ledger grows a journal. / M (depends on brief H landing). / Unrewarded prompts get ignored; that is acceptable, but never nag.

## 3. Three combinations to prototype first

**Prototype 1: A1 Replay the turn + A3 Hint as a question.** Both are tiny, both sit inside Roguelike Chess, both convert what the engine already knows (determinism, the bot, the best capture) into moments of insight. Together they test the central claim of this document: that tactical learning can be felt as a win rather than read as a tip. Measure with the existing bot win-rate harness plus one new number: the share of players who tap "see the turn" after a loss.

**Prototype 2: B8 Lesson note + C9 Party portraits.** Zero gameplay risk, pure framing: the run tells you what it proved and the party builder tells you why your pieces are what they are. This is the cheapest way to make the Arena's habit-to-power link visible, and it exercises the `Outcome.learned` hook across all 11 games, which the host should support anyway.

**Prototype 3: A4 Daily seed + C11 Habit-shaped pool.** The daily seed is the most likely feature to bring players back, and the silent habit lean tests whether personalisation can be discovered rather than announced. It must be shipped with the lean set very low and a clear way to turn it off in Settings.

## 4. What to avoid

- Quiz walls: any room, door or reward that requires a correct answer to proceed. Questions may open a bonus, never the path.
- Forced tutorials or any screen the player cannot skip on the first tap.
- Anything that reads streaks, trust, loyalty or utilities for a penalty, shows a number going down, or counts days missed on screen. C10 is the only idea near that line and must stay wordless about counts.
- Lectures in modal windows. One line on a card or a long-press, never a page.
- Real-world "learning content" that needs an expert to be correct (health, nutrition, finance). Facts stay general-knowledge and reviewed.
- Comparing the player to other people. The only comparison allowed is to the bot or to their own past runs.
- Making a learning game out of Roguelike Chess. It stays a tactics game; learning is a by-product the player can notice.

## 5. Open questions

- Should `Outcome.learned` notes be stored per game in the save (a new array, save v6 or later) or only kept in the run log? Prototype 2 needs an answer.
- Is a daily seed better as an Arena-level mode (one seed for all games) or a Roguelike Chess feature? The contract already passes `seed`, so both are possible.
- How much should pattern detection (A2) trust board-state heuristics before players notice false names?
- Can C11's lean be tested for "noticed but not creepy" without a user study? A small playtest with two or three people is probably the honest answer.
- Does the existing `botPlay` make a good "another line" teacher (A1), or does it need a second, more cautious policy so its lines look human?
