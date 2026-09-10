# Scope decisions — Group ownership overlay replaces per-plan owned stock in Group Rollup totals

_Recorded 2026-09-09, from a grilling session ahead of ticket-writing. No code
exists yet — this records what was decided, for whichever ticket(s)
implement it._

- **A Build Group gets its own "I own this" ledger, populated the same way a
  Build Plan's own owned-stock already is** — manual entry, or auto-detected
  from ESI assets with a location scope (`ownedStock.ts`'s
  `detectOwnedStock`, `OwnedStockScope`) — but scoped to the group's
  aggregate material list rather than one plan's. Reusing the existing
  detect+scope UX rather than inventing a second, manual-only ownership
  control the pilot would have to learn separately.

- **It is a display-only overlay: it nets against the group's total to show
  "still need to buy," and never writes into any member's own
  `materialSourcing`.** No allocation problem to solve (which member "gets"
  a shared unit of a material several plans need) — the group total is the
  only place group-level ownership is ever subtracted.

- **The group total ignores each member's own `materialSourcing.ownedQuantity`
  entirely — group-level ownership is the sole deduction applied at group
  scope, regardless of what any individual plan has entered for itself.**
  Explicit and deliberate, confirmed against the obvious alternative
  (stacking group-level owned on top of whatever each member already
  claimed, which double-subtracts the same physical stock and understates
  what's still needed): "Doesn't matter what someone puts in for owned in
  the individual items... group level does need to take into account number
  of runs and all the other calculations used in individual plans. Only
  owned input fields are not taken into account."

  This is a real behavior change from what `groupRollup.ts` does today: it
  currently takes each member's _already-computed_ `BuildResult`, which has
  already had that member's own owned stock netted out via
  `resolveMaterial`'s `claimOwned`. Making the group total ignore per-plan
  owned quantities means the group can no longer reuse a member's existing
  `BuildResult` as-is — it needs each member's tree re-resolved with
  owned-stock deduction disabled (sourcing's `ownedQuantity` treated as zero
  for this computation only), specifically for feeding the group rollup.
  Everything else about that computation — runs, ME/TE, waste, recursive
  sub-build costing — stays exactly as `resolveMaterial` already does it;
  only the owned-stock claim is switched off for this one path.

- **`groupRollup.ts`'s `overClaimed` mechanism is retired**, not kept
  alongside the new overlay. It exists today purely to flag when members'
  _per-plan_ owned-stock claims collectively exceed what the Character's
  hangar actually holds — a real risk only because the group total, until
  now, summed numbers that already had per-plan owned stock baked in. Once
  the group total stops reading per-plan owned quantities at all, that
  specific double-counting risk stops existing at the group level, so the
  flag has nothing left to guard. A member's own individual plan page is
  free to keep using its own `materialSourcing.ownedQuantity` for its own
  display — "it is fine to have the individual plan totals change as
  needed" — that's simply no longer a fact the group total reads.
