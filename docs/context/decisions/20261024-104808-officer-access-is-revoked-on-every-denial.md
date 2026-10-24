# Scope decisions — Officer access is revoked on every denial (issue #4969)

_Recorded 2026-10-24 · issue #4969._

- **A cached officer record is deleted on every denial, including `missing-scope`.**
  Corp Tax Book `authorizeOfficer` now matches SRP `authorizeSrpOfficer`. Rules grant
  reads until `expiresAt` while a record is held, so keeping it after a scope drop left
  stale read access. An ESI error (`readIdentity` throwing) still does not revoke: a
  brief 5xx must not lock every officer out.
