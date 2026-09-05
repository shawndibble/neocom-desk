# Scope decisions — Moon Mining Tax v1 implementation choices (issue #523)

_Recorded 2026-09-05 · issue #523._

- **`esi-industry.read_character_mining.v1` joins the Base Grant, not a new
  Scope Group.** `ScopeGate`'s re-auth banner always calls `beginEveLogin()`
  with no group argument, so a route gated on a scope that lives only in a
  group (the `corp` shape) would offer a re-login that never actually
  requests it — the group flow's real grant path is `CorpGrantPrompt` +
  the Settings row, built around a _discoverable_ signal (an in-game role)
  this feature has no equivalent of. Every other single-route, one-scope D3
  view in the app (mail, calendar, contracts, clones, contacts, loyalty) is
  Base Grant for the same reason, so this follows the existing pattern rather
  than building a second opt-in-grant UI for one scope. Cost: every existing
  user's next login re-authorizes once for the added scope, same as any past
  addition to this list.
- **Payees are per-character Editable Data (`sync/planSync.ts`'s
  `payeeSpec`), not account-wide.** The decision doc's data model is silent on
  whether a Payee is shared across a renter's alts. Account-wide would match
  the "I pay one corp, not one corp per alt" mental model, but costs the full
  `accountWideBackfill.ts` machinery (fan-out on add, `deletedAtByKey`
  self-heal, no per-character variant) for a nicety, not a stated
  requirement. Per-character keeps the sync surface identical to
  `buildPlanSpec`/`skillPlanSpec` — the well-trodden path — at the cost of
  re-adding the same Payee under each alt that rents from the same corp.
  Revisit as account-wide if that turns out to matter in practice.
  **Mining Tax Assignments are per-character regardless** — an Assignment is
  inherently owned by whichever character mined the ore, so this split was
  never a choice for it.
- **A Payee's moon/system tag (CONTEXT.md) is set from `AssignDialog`'s
  "remember this system for `<Payee>`" checkbox, not a field in Manage
  Payees.** The tag exists purely to auto-suggest a Payee for a future entry
  from the same system; the moment a pilot is looking at "this system, this
  Payee" (assigning an entry) is the only moment tagging it is free. Manage
  Payees would otherwise need its own system-name-search control for a
  system id nobody has memorized, for the same fact.
- **A `needs-review` Assignment resolves by re-snapshotting its own
  `oreLines`/value/tax to the entry's full fresh total for the types it
  already covers, always reverting to `outstanding` — even one that had been
  `paid`.** The alternative (split the growth into a second, delta-only
  Assignment so the original's `paid` history survives untouched) was
  considered and rejected for v1: it requires deciding how much of a _shared_
  ore line an already-paid Assignment actually paid for versus what grew
  after, which is unrecoverable once the growth has merged into one ledger
  line. Reverting the whole thing to `outstanding` can over-ask (re-showing
  an amount the Payee substantially already covered) but never under-counts,
  which is the one failure mode the decision doc's "never silently absorbed"
  rule is actually guarding against. A Payee who already covered most of it
  is a one-click "mark paid" away from square again.
- **The split-payee residual (`engine/miningTax/rowStatus.ts`) is
  presence-based per ore type, not quantity-subtraction.** First written as
  "entry quantity minus every covering Assignment's stored quantity, per
  type," which double-counts: a `needs-review` Assignment's stored quantity
  is stale by definition, so the un-covered _delta_ was showing up a second
  time as a separately-assignable "unassigned" residual for the same ore —
  caught by `snapshot.test.ts` before shipping. Assignments split by whole
  ore line, never by a partial quantity of one line (the decision doc's own
  two-corps-one-system-one-day framing), so "any covering Assignment names
  this typeId at all" is the correct and simpler test: a typeId is either
  claimed (by exactly one Assignment, pending review or not) or it isn't.
- **The "unclassified ore" allowlist-gap banner compares against a second,
  broader SDE-derived list (`oreAndIceTypeIds.json`: every ore/ice type this
  app can name, moon or not), not "not in the moon-ore allowlist."** The
  latter would flag every ordinary asteroid-ore and ice row the ledger
  legitimately contains, which the decision doc explicitly says needs no
  special handling. Both lists are derived at SDE build time from the "Moon
  Ores"/"Standard Ores"/"Ice Ores" market group trees
  (`scripts/build-sde.mjs`), so a future CCP rarity tier is picked up on the
  next `npm run sde:build` rather than requiring a code change — and a
  `type_id` recognized by neither list is a real allowlist gap, surfaced
  rather than dropped.
- **No e2e coverage added for `/moon-mining-tax`.** Consistent with the
  existing app: 8 of 51 routes have an `e2e/*.spec.ts` today, and
  `docs/ARCHITECTURE.md` §7 frames e2e mocks as "if the view needs it," not a
  per-route requirement. Left for whoever picks this up next if the surface
  proves to need one.
