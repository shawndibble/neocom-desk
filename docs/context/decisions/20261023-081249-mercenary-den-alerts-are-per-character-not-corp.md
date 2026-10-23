# Scope decisions — Mercenary Den alerts are per-Character, not corp (issue #4782)

_Recorded 2026-10-23 · issue #4782._

- **Both den events and the Calendar kind are per-Character.** ESI serves dens
  by character only (no corporation route, no role; see the #4791 decision), so
  the original ticket's corp surfaces are dropped: no rows in the
  `corpSovereignty` widget, no `ADDITIVE_CORP_CAPABILITIES` entry, no corp
  board kind, nothing in `corpDeadlines`, the `Next` button or the Deadline
  Strip. The MTO row in `raids` is dropped too: the operations route is
  character-scoped (`esi-activities.read_character.v1`), not public.
- **`mercenaryDenReinforced` is a Scheduled Push** (ADR 0010: the exit is a
  known timestamp, so no server token is needed) with two phases of one exit:
  a warning at the Character's lead time (default 1 h) and an "out" push at the
  exit. Both are hedged, since a den can leave reinforcement early with the app
  closed.
- **It is the one `critical` personal event.** Severity is per event, never
  per fire (`alertSeverity`), so the lead-time warning is a Danger banner
  entry too, not only "out now". A reinforced den is a base under attack, so
  that was judged right rather than splitting the event in two.
- **`mercenaryDenAnarchy` is foreground-only.** It is a diff, and the Alerts
  Grant (ADR 0020) carries the notifications scope only, never the den scope.
  Its Settings row says so. It fires once per crossing of the Character's
  threshold (default 50 % within the den's level), re-arming when it drops
  below or the level changes, and stays quiet when the previous read was blank.
- **No Calendar kind from this ticket.** Develop gained the `mercenaryDen`
  Clock Kind (#4806, with its own colour and glyph) while this was in flight,
  and it already carries the reinforcement exit, so a second kind would
  duplicate it. The ticket's Calendar section is satisfied by that.
