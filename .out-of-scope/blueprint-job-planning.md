# Planning Research and Copying Jobs

Build Plans model manufacturing jobs only. Planning a **research** job (material
efficiency or time efficiency) or a **copying** job is out of scope.

This does not affect _watching_ those jobs. Active Jobs already reads every
activity ESI returns — manufacturing, ME research, TE research, copying,
invention and reactions — with progress, a countdown and a per-activity filter
chip. What is out of scope is planning one before you start it.

## Why this is out of scope

A Build Plan exists to answer two questions, and neither one can be asked about a
research or copying job.

The **Acquisition Verdict** asks whether the product costs less to build than to
buy at the trade hub. The **Sale Profitability** read asks whether building it
and selling it turns a profit. Both need a market price for what the job
produces.

Research produces no item at all — it changes an attribute on a blueprint you
already own. There is no market listing for "this blueprint at ME 10" to compare
a research bill against. Copying produces a blueprint copy, and blueprint copies
are not tradeable on the EVE market; they move by player contract only, so the
app's price source (Fuzzwork market-order aggregates) has nothing to quote.

Strip both verdicts out and what remains is a job-fee calculator with a duration
attached — a much smaller thing than a Build Plan, wearing a Build Plan's
chrome. That does not earn a plan type, a record shape to sync and migrate, or a
branch through the detail pane.

Round 1's scope decision therefore stands unchanged: _"Industry: manufacturing
only; model shaped so invention bolts on later."_

## What was considered

Three shapes were drawn up and reviewed before this was rejected, so the decision
is "no", not "not yet":

- an `activity` field on `BuildPlanRecord`, branching the existing detail pane
- Blueprint Plans as a second record kind, with their own pane and list group
- blueprint jobs as a sub-panel inside the manufacturing plan that motivates them

Mockups (desktop and phone, all three):
https://claude.ai/code/artifact/62e80ffa-488f-4910-8b66-81bf268c909b

All three were coherent. None of them changed the fact that the output has no
price.

## If this is reconsidered

The blocker to look at first is not the UI shape — it is that the ESI cost basis
for activities 3, 4 and 5 was never verified. Research and copying are
system-cost-index-driven like manufacturing, but the base they multiply is the
blueprint's own value rather than material EIV, and whether the existing
facility and rig multipliers apply unchanged to those activities is unknown.
Source that the way `engine/industry/types.ts` sourced the manufacturing
formulas before anything else.

## Prior requests

- #459: "Industry: extend Build Plans to cover Research (ME/TE) and Copying jobs"
