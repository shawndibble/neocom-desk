# Scope decisions (round 38) — the Personal / Corporation switch

_Recorded 2026-09-03._

- **The switch adds a data source and a control, never a second UI.** The corp
  side reuses the page's existing table, columns, empty states and phone card
  collapse. On Industry this is exact: the two ESI job shapes differ only in
  `location_id` vs `station_id` and a few corp-only ids, none of which the
  panel renders, so the helpers and CSV columns are widened to the structural
  subset (`ActiveJob`) they actually read. On Wallet the journal is literally
  the same schema, so it is literally the same columns.
- **No capability, no control.** The hide rule of round 35, applied to a page
  rather than a nav item: with no Corp Capability the switch does not render at
  all — no lock, no disabled control, no explanation — and the page is
  byte-for-byte what it was. This is the whole reason the direction was kept:
  a permanently dead "Corporation" tab on three working pages would make them
  look broken for the ~95% who hold no corp role.
- **An unknown corporation hides the switch too.** `corporationId` is learned
  only from the public-info read, so on a cold device it is simply absent —
  and a switch whose corp side has no corporation to read is a switch with
  nothing behind it.
- **Corp data is fetched only once the switch is flipped.** `useCorpSnapshot`
  is inert while its key is null, so a visit that never asks for corp data
  never touches the role-gated, rate-limited corp endpoints. This is also what
  gives each side its own `DataAgeBadge` value for free: the two results are
  separate, have different cache windows, and must never share one badge.
- **A 403 on a corp endpoint is the in-game role gate, and never a re-login
  prompt.** Every other data module takes the shared `isAuthFailure`, which
  counts 401 and 403 alike; `features/corp/corpAuthFailure.ts` subtracts the
  403 for corp reads only. Re-authing cannot change an in-game role, so a
  `ReauthBanner` over it is the failure `ScopeGate.tsx` warns about made
  routine. A 401 still counts.
- **The corp wallet journal caches per division.** ESI publishes no
  all-divisions journal and the seven are separately role-gated in game, so the
  division is part of the `corpCacheKey` — without it the seven would overwrite
  each other in one row and a division switch would show the previous one's
  entries.
- **Wallet's Transactions tab is personal-only.** ESI has a corp wallet
  transactions endpoint; `ESI_REGISTRY` does not, and `esi/scopes.ts` derives
  everything from the registry. So the tab is dropped while Corporation is
  selected rather than shown empty, and a visitor already on it lands on the
  journal.
- **Assets was dropped, and not because it strained.** There is no
  `/corporations/{corporation_id}/assets` in `ESI_REGISTRY`, no
  `esi-assets.read_corporation_assets.v1` in the `corp` group, and no assets
  Corp Capability in `engine/corpRoles.ts` — the endpoint, the scope and the
  capability were never registered, so there is nothing for a switch on
  /assets to gate on or read. Adding them is a registry and capability
  decision (rounds 35 and 37's territory), not a page decision. The separate
  design objection stands and is why nobody should reach for it casually: corp
  assets are seven hangar divisions across many structures, a different mental
  model from a personal asset list.
