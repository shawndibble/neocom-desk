# Scope decisions — Corp widget follow-ups after review

_Recorded 2026-10-21._

- **The Roles tab is a path segment, `/corp/members/roles`** (ADR 0015).
  `/corp/members` is a tabbed page (`CORP_MEMBERS_TABS`); a bare visit lands on
  `/corp/members/members`, an old `?tab=roles` link moves to the path, and a
  Character without `canReadRoleAudit` is moved from the Roles path to the roster.
- **Corp kills is the one ungated corp kind.** It reads public zKillboard
  stats, so it carries no capability and makes no ESI call. It still lives only
  on the Corp overview, which needs Corp Access.
- **A corp clock's floor is its own read's cache window**: 1 h for the corp
  reads, 5 min for corp contracts (ESI caches that route for 300 s), not one
  global 1 h.
- **Starbase fuel burn rates are a committed table** (`engine/corp/starbases.ts`),
  transcribed from the SDE's `controlTowerResources`; a tower type missing from
  it shows quantities only, never a guessed clock. Each tower's clock is
  measured from its own detail read, never the oldest read of the batch.
- **A Character whose every corp capability is ungranted is
  `roles-without-grant`**, even when those capabilities are additive: an
  additive capability must not demote a Character that already reads other
  corp data, but on its own it must still lead to the Grant prompt.
- **The corp contracts widget and the Contracts page share one read path**, so
  an accepted courier (ESI keeps it `outstanding`) counts on both.
- **Corp views of a character page are read-only.** The corp Market orders view
  drops the pilot's work-through columns (no cost basis, no relist advice).
- **Corp views of a character page are a third option ("Corporation") on the
  Character filter picker**, not a separate Character / Corp switch.
- **Contracts History gains All characters.** One `loadContracts` read per
  Character holding the contracts scope (the rest are skipped, noted), deduped by
  `contract_id`, each row read relative to its own Character, with a Character
  column in that mode only. Corporation is a third data source of the same table.
