# Planning Invention Jobs

Build Plans do not model invention, and planning an invention job is out of
scope. Watching one is not — Active Jobs already shows running invention jobs
with progress, a countdown and their own filter chip.

## Why this is out of scope

Invention is only useful as part of a chain, and this project has already
decided not to build chains.

An invention job turns a T1 blueprint copy plus datacores and an optional
decryptor into a probabilistic chance at a T2 blueprint copy. Its output is a
BPC, which is not tradeable on the EVE market — copies move by player contract —
so the app's price source has nothing to quote for it. That rules out both of the
reads a Build Plan exists to produce: there is no "buy this BPC instead" price
for an Acquisition Verdict, and nothing to sell into for a Sale Profitability
read (see `blueprint-job-planning.md`, which rejects research and copying for
the same missing-price reason).

What invention _can_ produce is a cost per successful BPC. That number is real
and useful, but only as an input to the T2 manufacturing plan that consumes the
BPC — which is precisely the Bill-of-Materials rollup round 27 scoped out:

> A Bill-of-Materials rollup — one plan absorbing its components' costs
> recursively — is a different feature and stays out: `BuildPlanRecord` is one
> blueprint per plan.

So invention is either chained, which reopens a settled rejection, or unchained,
in which case it hands you a figure to retype into another plan by hand.

Against that, the build cost is high and entirely new: invention probability math
(base chance by relic and security, decryptor modifiers, Encryption Methods and
the relevant science skills) is engine territory this repo has none of, and the
decryptor choice changes the runs, ME and TE of the resulting BPC — a real
optimisation problem, not a formula.

## If this is reconsidered

The question to answer first is not about invention at all. It is whether
`BuildPlanRecord` should stop being one blueprint per plan. Reverse round 27's
rollup decision first; invention becomes worth building only on the other side of
that.

## Prior requests

- #460: "Industry: planning support for Invention and Reaction jobs" (the
  reactions half was kept and continues on that issue)
