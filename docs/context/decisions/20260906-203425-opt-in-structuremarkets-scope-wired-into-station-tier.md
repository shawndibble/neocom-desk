# Scope decisions — opt-in structureMarkets scope, wired into station-tier undercut (issue #538)

_Recorded 2026-09-06 · issue #538._

- **`esi-markets.structure_markets.v1` is registered under a new opt-in
  `structureMarkets` scope group, never the base grant.** Same reasoning as
  the `corp` group (issue #295): almost no character has ever listed an order
  inside a player structure, so asking everyone for it at sign-in would cost
  every user a longer consent screen for a check the overwhelming majority
  can never use.
- **No settings surface requests this group yet.** Building one (where does
  the prompt live, what triggers it) is a separate product decision the
  issue's own Scope section never asked for. Until one exists, the scope is
  grantable in principle but ungranted in practice — every row degrades to
  the same "unavailable" message already shown for an ACL-denied structure.
- **The fetch is per-order-detail-open, per structure, never eager.** The
  structure-markets endpoint cannot be filtered by `type_id` — a busy trade
  tower's WHOLE book comes back — so it is only ever fetched when a detail
  view opens for an order sitting there, keyed by `locationId` so every order
  at that structure shares one fetch. This is the "only on demand" option the
  issue's Scope section named as one way to bound it.
- **A structure's competitors are merged into the SAME deep-competition list
  the region book already feeds `findUndercut` with, rather than a parallel
  mechanism.** `openOrdersModel.ts`'s existing `scopesChecked` logic already
  includes `'station'` whenever any deep fetch has run; extending it to also
  include structure-book entries (filtered to the order's own `type_id`,
  since the structure book mixes every item) needed no change to that
  priority logic at all — the model change is entirely in what competitor
  list gets built.
- **A player structure's `'system'` scope stays hard-coded `'unavailable'` in
  the Order Detail modal, regardless of what the model computes.** One
  structure's book cannot answer "who else in this system beats me" — it
  only ever contains this one structure's own orders — so nothing about
  #538 changes that; the modal's existing structure-vs-system guard was
  already correct and untouched.
