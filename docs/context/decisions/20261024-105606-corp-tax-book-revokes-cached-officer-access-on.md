# Scope decisions — Corp Tax Book revokes cached officer access on every denial (issue #4969)

_Recorded 2026-10-24 · issue #4969._

- **Every denial deletes the held officer record.** `authorizeOfficer` no longer keeps it when the renewal token lacks the roles scope; it matches SRP's `authorizeSrpOfficer`. An officer who withdraws the scope loses cached read access at once instead of at the 24h expiry. ESI errors (identity read throws) still do not revoke.
