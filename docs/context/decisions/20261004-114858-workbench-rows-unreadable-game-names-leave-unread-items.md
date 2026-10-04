# Scope decisions — Workbench rows: unreadable game names leave unread items unknown (issue #2542)

_Recorded 2026-10-04 · issue #2542._

- **When the game's full list of type names (`typeNames.json`) can't be read,
  an item the EFT loader couldn't read is _unknown_: never called removed, and
  never overlooked for "Seen on zKillboard".** The Out-of-date check and the
  sightings now read unread items through one rule (`unreadItemStatus`). Each
  needs the safe answer in its own direction: a fit isn't hidden as out of date
  on a guess, and a fit isn't badged on what's left after dropping a line on a
  guess. So the rule has three answers (`in-game`, `removed`, `unknown`) rather
  than defaulting the missing list to "everything is in the game".
