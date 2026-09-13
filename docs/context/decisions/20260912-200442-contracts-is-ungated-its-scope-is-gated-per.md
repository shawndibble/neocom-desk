# Scope decisions — Contracts is ungated; its scope is gated per tab

_Recorded 2026-09-12._

- **`/contracts` is `UNGATED` in `ROUTE_REQUIREMENTS`, and not because it
  needs no scope.** History needs `read_character_contracts`. The page gates
  that scope per _tab_ instead — the same shape `/wallet` already uses, where
  each panel raises its own `ReauthBanner` from its own `needsReauth` result.
  `ScopeGate` renders its banner _in place of_ the whole route, so the page
  gate walled off the Search tab as well: a shared public snapshot that needs
  neither the scope nor this Character's data at all. With Search now the
  tab the page lands on, that gate stopped a scope-less pilot at a wall in
  front of the one tab that would have worked for them.
- **The History branch keeps explaining itself, unchanged.** `loadContracts`
  derives `needsReauth` from the live call's 401/403, not from the stored
  grant, so a Character missing the scope takes a real 403 and gets the same
  `ReauthBanner` the revoked-scope case always got. Ungating moves _where_
  the explanation appears, not whether it appears.
- **This does not change what the app asks for at login.** The login scope
  set is `SCOPES` in `esi/scopes.ts`; `ROUTE_REQUIREMENTS` only ever reads
  from it to decide gating. `read_character_contracts` is still requested.
