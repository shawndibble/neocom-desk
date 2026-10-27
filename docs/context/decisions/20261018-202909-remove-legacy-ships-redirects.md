# Scope decisions — Remove legacy Ships redirects (issue #4138)

_Recorded 2026-10-18 · issue #4138._

- **The `/fittings/*` and `/skills/ships` redirects are removed.** `LegacyShipsRedirect` and `legacyShipsLocation` are deleted; old `/fittings?f=` Share Links and `/skills/ships` bookmarks now 404. Supersedes the earlier "redirects are permanent" decision. `/share/fitting?f=` and `/s/<id>` links are unaffected.
