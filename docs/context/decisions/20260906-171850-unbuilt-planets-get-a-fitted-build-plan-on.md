# Scope decisions — Unbuilt planets get a fitted build plan, on a borrowed link cost

_Recorded 2026-09-06._

- **An unbuilt planet is now pin-fitted, reversing "the estimate stays out of
  pin-fitting" (rounds 51/53/56).** That rule was right about the failure it
  guarded — `engine/pi/linkCost.ts` needs the distance between two pins, which
  only a colony that exists has, and fitting links at zero overstates what fits
  by exactly the amount #440 was filed about. It was wrong about the price: it
  left the resource ranking deciding nothing but a single extractor's
  ISK-per-hour, so a pilot recorded scan knowledge and the app answered with a
  number, never "so build this". A control that decides nothing is worse than
  no control.

- **The link cost is borrowed from the pilot's own colonies, never invented.**
  `unbuiltPlanModel.medianNewLinkLoad` takes the median hop across their built
  colonies — the middle entry by CPU, whole, since both axes scale with the
  same distance and a per-axis median would describe a hop none of their
  colonies has. Every pin of a fitted layout is charged that hop. With no
  colony to measure, `unbuiltPlanAdvice` returns `needs-link-cost` and the card
  says so. That keeps the half of the old rule that mattered: links are never
  free.

- **Four refusals, no defaults.** Nothing picked, no measured extraction to
  project from, no hop to borrow, and no _trained_ Command Center ceiling each
  return their own status and print no figure. The ceiling guard follows the
  rule the colony-slot count and the header chip already follow — an assumed
  figure may be shown, never acted on — because untrained is one level and
  fitting against it would tell a pilot at Command Center Upgrades V that
  nothing fits.

- **The ranking became a pick.** `RichnessRanker`'s drag-to-order list is gone;
  `ResourcePicker` asks "pull which of these?" and the ticked set is fed to
  `recommendStopTier` as its candidate `localResources`. Ticking a second
  resource closes a P2's P0 set and makes it reachable, which is the payoff the
  ordering never had. Click order survives as preference order in the same
  `planetRichness` store, so nothing that depended on rank lost its input.
  `estimateUnbuiltPlanet` and `rankedResources` are deleted: the fitted plan
  supersedes both.

- **A slot-blocked planet's card is the training message and nothing else.** No
  resource picker, no estimate, no Details. All of it is advice a pilot cannot
  act on until a slot frees up, and offering it under a "you cannot build here"
  banner is what made that card noise. Still gated on `!slots.assumed`, so an
  unread skill never blanks the card.

- **Instructions moved to a fixed three-slot row; the prose moved to a modal.**
  `DirectiveRow` is VERB · what · number, right-aligned and tabular, with
  inputs as chips. Nothing was deleted: the demand-against-supply arithmetic,
  the economics, the alternative to removing and the preconditions all live in
  the per-colony detail modal, which is one `<Modal>` at panel level with the
  selected planet in state. Caveats that used to be sentences are badges —
  `Est.` on every projection, an amber row for a plan that assumes a removal —
  because a caveat has to survive a glance.

- **"Keep selling this raw" is its own verb.** `asIs` is quiet and outlined,
  never `rebuild`: tagged as a rebuild beside a six-figure figure it read as an
  instruction to tear down a colony that was already right. This is the
  layout's version of the `stopTierSellRaw` / `stopTierSwitchRaw` split the
  copy already made.
