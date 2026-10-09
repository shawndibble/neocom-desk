# Scope decisions — Survey your share reads the mining ledger for a chosen system

_Recorded 2026-10-08._

- **"Your share" comes from the viewer's own ESI mining ledger.** It sums the
  survey's ore types mined in one system, on the UTC date(s) the survey's scans
  fall on, in m³ (units times the SDE's unit volume), and gives it as a percent
  of the volume the survey says has been mined. It sits on the Survey tab only:
  the public page has no Character.
- **It is a running total, not a per-scan figure, and it says so.** The ledger
  has days and systems, no times, and runs a few minutes behind the game, so ore
  mined before the first scan counts and two sessions in one system on one day
  can't be told apart. An info tooltip on the line states this; the share is
  capped at 100%.
- **A Survey doesn't record its system, so the viewer names it.** It defaults to
  the Character's current system when the location grant is there, and a typed
  name (resolved the same way a Build Plan's system is) overrides it. The choice
  is a device-local setting, not stored on the survey: it is a fact about the
  viewer's own mining, and other pilots may be in other systems.
- **With no mining ledger (grant missing, ESI silent) the line is not shown.**
  No empty state or nag: the rest of the board stands on its own.
- **"Copy link" moved into a caret menu on the chat-message button**, the split
  button Save uses in Fittings. The message already carries the link, so the menu
  holds only the link on its own.
