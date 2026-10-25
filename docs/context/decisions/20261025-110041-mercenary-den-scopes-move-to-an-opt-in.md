# Scope decisions — Mercenary den scopes move to an opt-in Permission (issue #5153)

_Recorded 2026-10-25 · issue #5153._

- **`esi-structures.read_character.v1` and `esi-activities.read_character.v1`
  leave the default-on `planets` Permission for their own opt-in
  `mercenaryDens` Permission.** This supersedes the first bullet of
  `20261023-055927-mercenary-den-scopes-join-the-base-grant-in.md` (#4791).
  The feature (one Overview widget, the den page, one Notification Event) is
  niche, and every Character paid a consent-screen line for it. That cost
  outweighs the extra SSO round trip for the few who use dens.
- **Existing Characters keep what they granted.** `isPermissionGranted` is per
  Permission and stored scopes are unchanged; a Character without them sees the
  standard Grant access state, now naming Mercenary dens, not Planets.
