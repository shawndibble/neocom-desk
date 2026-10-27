# Scope decisions — Reaction Location: a second facility context lets Craft Sweep recurse into reactions (issue #698)

_Recorded 2026-09-10 · issue #698, from a grilling session ahead of
implementation. No code exists yet — this records what was decided._

- **Supersedes the "advisory-only, not actionable" bullet of
  `20260905-130600-reactions-as-a-build-plan-activity.md`.** That decision
  kept a reaction-produced sub-input from ever being recursively built inside
  another plan's tree, naming the reason explicitly: doing so would need "a
  whole second facility/rig/security context nested inside the parent plan,"
  which it declined to build. This decision is that second context — the
  facility-nesting problem is no longer unsolved, so the boundary it caused
  no longer needs to hold. Everything else that 2026-09-05 decision recorded
  (reaction formulas share the blueprint catalog, always run at ME0/TE0,
  reactor rigs use their own security-multiplier table, no skill carve-out)
  is unaffected and stays in force.

- **A manufacturing-activity Build Plan gets a new "Include Reactions"
  toggle in its Setup**, off by default. Off, none of the fields below exist
  on screen at all — this is not a set of fields that merely go inert.

- **Switching it on reveals a Reaction Location** — a second, independent
  instance of the same control shape the plan's existing Build Location
  already has: location search restricted to Athanor/Tatara, reactor rig
  fit (a different rig catalog than a manufacturing structure's), a tax
  override, and a security band read off whichever location was picked,
  exactly like the existing Build Location box already does for the plan's
  primary facility. It is a second, independent fact, not a derived one —
  nothing recomputes it from the plan's own primary location.

- **A Build Plan whose own top-level activity is already `reaction`
  (issue #460) never gets a Reaction Location.** It reuses its own existing
  top-level location for any nested reaction sub-build (a reaction consuming
  another reaction's output). The toggle and the second location only ever
  appear on a manufacturing-activity plan — a reaction-activity plan is
  already reaction-capable by construction, and asking it to configure a
  _second_, independent reactor for the rare case of a nested sub-reaction
  was rejected as solving a corner of a corner case.

- **A new, explicit Settings-level default preference pre-fills a fresh
  plan's Reaction Location**, the first time Include Reactions is switched
  on for it — not the "carry forward the most-recently-edited plan's own
  facility" precedent issue #456 already established for the primary Build
  Location. A pilot's manufacturing location changes plan to plan far more
  often than their one dedicated reactor; carry-forward alone would only get
  the reactor right by accident of edit order, so this gets its own real
  default instead, the same way assumed-ME/assumed-TE preferences already do
  for Fit Import.

- **`resolveMaterial` gains a `method === 'reaction'` recursion branch,
  mirroring the existing `method === 'manufacturing'` one exactly** — a
  reaction sub-build recurses using the plan's Reaction Location context (or
  the plan's own top-level context, when the plan's own activity is already
  `reaction`), the same way a manufacturing sub-build already recurses using
  the plan's one shared context at every depth, however many levels deep.

- **The manual per-item craft/buy toggle (`canBuildHere`) becomes consistent
  with Craft Sweep, not a second, narrower gate.** A reaction material
  becomes hand-toggleable exactly when Include Reactions is on for that plan
  (or the plan's own activity is `reaction`) — otherwise a pilot who ran a
  Craft Sweep, then hand-flipped one reaction material back to buy, would
  have no way to flip it back short of re-running the whole sweep.

- **Craft Scope's `Reactions` option (reserved since
  `20260909-212715-craft-sweep-bulk-build-depth-strategy-control-for.md`)
  becomes real and selectable exactly when Include Reactions is on for the
  plan being swept**, and stays visibly-reserved-but-disabled otherwise — the
  same treatment Planetary/PI keeps permanently for now. Planetary/PI is
  explicitly punted to its own, unspecced future ticket: PI has no
  facility/rig/security concept to reuse at all (colonies, extractors, pin
  budgets are a wholly different mechanic), so it cannot share this ticket's
  solution and was never a candidate for it.

- **The existing advisory, non-recursive reaction estimate stops guessing.**
  `reactionUnitCost` (`makeOrBuy.ts`) currently hardcodes an unfitted Athanor
  with no rig for _any_ plan's reaction-producible sub-input marker,
  regardless of that plan's real facility — a deliberate conservative
  approximation recorded in the 2026-09-05 decision, back when no real
  facility could ever be configured for this. Once a Reaction Location (or a
  reaction-activity plan's own location) exists, both that advisory marker
  and Craft Sweep's `cost-effective` Sweep Strategy quote a reaction
  candidate against the real configured facility instead.

- **No change needed to ME/TE or to verdict computation.** ME/TE was already
  fully settled: reaction formulas can never be researched in EVE at all (not
  a code shortcut — a game-mechanics fact), and every existing code path
  already forces ME0/TE0 unconditionally. Verdict computation
  (`buildVsBuy`'s rollup) is pure arithmetic over `lineCost`/`totalCost` with
  zero activity-awareness anywhere in it, so a tree mixing manufacturing and
  reaction sub-builds already totals correctly the moment `resolveMaterial`
  can recurse into both — no branching needed in the rollup itself.
