# Scope decisions — Skyhook raid alert: an empty silo is never a danger Alert (issue #4784)

_Recorded 2026-10-23 · issue #4784._

- **The default silo minimum is 1 unsecured unit, not 0; an empty silo is never a
  danger Alert.** At 0 every open window was a danger Alert, including one with
  nothing in it to steal. Research (CCP's Equinox notes, EVE University, patch-note
  summaries) gives no typical bay size or output rate, so no larger default can be
  defended; "is anything at risk" needs no guess. `siloAtRisk` is now: stock unread
  (still at risk, never called safe), or stock above 0 and at or above the minimum.
  A saved 0 behaves as 1. Options are 1, 100, 1000, 10000, and the hint says the
  larger steps are guesses. Supersedes the "default 0" line of
  `20261023-094617-skyhook-raid-alert-units-not-percent-severity-from.md`.
