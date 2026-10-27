# Scope decisions — Courier endpoints show system security, not the space band

_Recorded 2026-09-22._

**Supersedes** the display half of
`20260912-165245-courier-hauls-carry-endpoint-space-not-route-safety.md`
(#939): the "band rides inside the route cell" and "shows 'Unknown space'"
bullets. That file stays as written — this directory is append-only — and its
filter bullets still stand.

- **Each end of a haul prints its system's security status right after the
  system name — "Jita 0.9 The Forge" — and the band word is gone from the
  route cell.** "Highsec" puts a 0.5 gank system and a 1.0 core system in one
  word, and a hauler weighs exactly that difference; the number carries the
  band anyway, so nothing is lost. Rounded through `shownSecurity` and colored
  by `securityStatusColor` (`SecurityStatus`), the number the game shows. At
  every width, not only on the phone card, and in the detail modal's endpoint
  line too ("Jita 0.9 · The Forge"). It is still _endpoint_ security: nothing
  here says anything about the route between the two ends.

- **An end nothing local places prints no security at all**, rather than
  "Unknown space". Its bare id in the name slot, and the Structure marker where
  one applies, already say it is unplaced; a third word for it only crowds a
  phone card.

- **The band stays where it filters.** `CourierEndpoint.space`, the
  **Destination space** chips and the empty-state hint about unplaced
  destinations are unchanged — a band is still the right grain for "where will
  I deliver into", and the chips need a word to be tapped. `nullsec` still earns
  no row marker: a `0.0` beside the name is the note the band word used to be.

- **Not done here:** no security for the systems _between_ the ends — that is
  still the per-row route lookup every courier scope decision refuses. The
  detail modal's route exposure section remains the only place the route
  itself is described.
