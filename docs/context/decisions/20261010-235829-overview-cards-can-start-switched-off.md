# Scope decisions — Overview cards can start switched off (issue #3541)

_Recorded 2026-10-10 · issue #3541._

- **A card can be off by default; Incursions is the first.** Most pilots never
  run Incursions, so a card everyone would have to hide is opt-in instead. It
  is listed in the edit menu like every other card, and once on it hides and
  reorders the same way. This narrows "a card added later shows by default"
  from `20260929-114130-overview-cards-can-be-hidden-by-the-pilot.md` to
  cards not listed in `OVERVIEW_DEFAULT_OFF_CARDS`.
- **Still the one synced hidden-cards list, with a `show:<key>` marker for
  "on".** A plain key already means "hidden", so it can't also mean "on".
  A second synced key would need its own sync wiring and could disagree with
  the first. Older builds keep the marker because they keep unknown keys.
  "Show all cards" switches the off-by-default cards on too.
- **An off-by-default card makes no reads while it is off.** Unlike the
  hidden-cards rule, where hidden cards still load, the Incursions reads (the
  pilot's location, their jump basis and the public feed) run in a component
  that mounts only while the card is on. They are three fetches nobody asked
  for.
- **The Incursions card states conditions, not verdicts.** Its header has no
  severity word, because a nearby Incursion is nothing the board should call
  urgent. Every row still carries `clear`: the card uses `TriageRow`, which
  requires a tone, and `clear` is the neutral one, not a verdict on the site.
  The card and Route Safety's panel read through one hook (`useIncursions`,
  #3540), so they never disagree about a distance.
