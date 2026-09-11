# Scope decisions — Corp-owned stock keys on the corporation, not the reading Director (issue #798)

_Recorded 2026-09-10 · issue #798._

- **A corp-owned owned-stock placement carries `characterId` (the reading
  Director) and `corporationId` (the actual owner) side by side, and every
  identity operation — `ownedStockLocationKey`, `placementKey`,
  `collectStockLocations` — keys on `corporationId` when present, never on
  `characterId`.** Attributing a corp placement to whichever Director's
  access happened to read it (the ticket's explicitly rejected alternative)
  would mean switching the active Director changes the placement's identity,
  silently orphaning a plan's already-persisted `ownedStockScope` selection
  and, worse, letting the same corp hangar register as two different
  "locations" depending on who last read it. `characterId` is kept on the
  placement anyway, not dropped: structure-name resolution
  (`resolveStockLocationNames`) is ACL-checked per Character even for a corp
  asset, so the reading Director's id is still needed downstream — it is
  just no longer part of the placement's _identity_.
- **The corp key format is `corp:<corporationId>:<locationType>:<locationId>`,
  a distinct prefix layered onto the existing
  `<characterId>:<locationType>:<locationId>` personal format, rather than a
  new shared shape for both.** `OwnedStockLocation` is a persisted value —
  it lives inside `BuildPlanRecord.ownedStockScope` and round-trips through
  `sync/planSync.ts`. Changing the personal key's format at all would mean
  every already-saved plan's `{ mode: 'selected' }` scope stops matching its
  own placements the next time it loads — "use all" silently drops to zero
  on a plan the player never touched. The prefix keeps every existing
  personal key byte-identical, so no migration is needed and old data keeps
  working unchanged.
