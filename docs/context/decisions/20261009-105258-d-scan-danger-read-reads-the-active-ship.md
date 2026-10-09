# Scope decisions — D-Scan danger read reads the active ship via esi-location.read_ship_type

_Recorded 2026-10-09._

- **A new read scope, `esi-location.read_ship_type.v1`, joins the Base Grant
  as its own default-on Permission, Current ship.** The D-Scan danger read
  defaults "Your ship" to the hull the active Character is flying
  (`GET /characters/{id}/ship`), so the pilot does not pick it by hand.
  Folding it into Character details was rejected for the same reason as the
  autopilot waypoint scope (`20261003-175151`): a Permission counts as granted
  only when all its scopes are, so every Character that signed in before this
  would read as missing Character details though implants, clones and location
  still read.

- **Existing Characters keep working.** Without the scope the read falls back
  to picking the hull by hand and offers the existing Grant flow; no new
  banner. A 403 for the ungranted scope is a missing grant, not an auth
  failure, so it never trips the shell-wide re-auth banner (only a 401 or a
  failed refresh does), as for location.

- **The ship is cached for 90 seconds**, not the app-wide ten minutes: it
  changes whenever the pilot undocks in another hull. Only the ship type id is
  kept; the ship's name and item id are not read.

- **Outside the repo:** the CCP developer application must list
  `esi-location.read_ship_type.v1`, or SSO refuses the wider scope request.
