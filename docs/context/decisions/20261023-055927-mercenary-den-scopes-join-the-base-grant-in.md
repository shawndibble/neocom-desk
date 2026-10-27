# Scope decisions — Mercenary Den scopes join the Base Grant in the planets Permission (issue #4791)

_Recorded 2026-10-23 · issue #4791._

- **`esi-structures.read_character.v1` and `esi-activities.read_character.v1`
  go in the default-on `planets` Permission**, not a new opt-in `ScopeGroup`.
  Dens sit on planets (a skyhook's planet), and Shawn's standing preference is
  against more opt-in groups: each one is another EVE SSO round trip per
  Character, which with many alts is the friction the corp-roles decision
  already weighed.
- **The widget lives on the player Overview, not the Corp Board.** ESI serves
  dens per character only (no corporation route, no role), so a corp-wide den
  list cannot be read.
- **Existing Characters are not re-granted.** Their tokens lack both scopes
  until they log in again; the widget shows its standard Grant access state for
  them, the same contract every Overview kind's `endpoints` already gives.
- **A Character with the den scope but not the operations scope** still lists
  its dens; the Operations column reads unknown (—), never "None".
