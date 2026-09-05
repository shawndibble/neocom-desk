# Scope decisions — Overview market tile becomes open orders over order slots

_Recorded 2026-09-04._

- **The Overview's third summary tile counts open market orders, not Quickbar
  items.** The Quickbar is a bookmark list the user edits by hand, so its
  length told them a number they already knew and that never changed on its
  own. Open orders is the market figure that moves without the user doing
  anything and that has a ceiling worth watching. The tile is relabelled
  "Open orders" and links to `/market?section=orders` — the Open Orders tab —
  rather than the scope-free Browser tab.
- **The tile shows used over available: `12 / 305`.** The denominator is the
  character's Order Slots (see `CONTEXT.md`), derived in
  `src/engine/market/orderSlots.ts` from the four Trade-group skills. ESI
  publishes the open orders but never the ceiling, so the ceiling has to be
  computed; putting it in `src/engine` keeps it pure and test-first, and keeps
  the one place that knows the per-level numbers out of the route.
- **The ceiling rides the skills snapshot the Overview already loads.** It is
  read from `loadCorrectedSkills`'s `trained` map inside
  `loadSkillsQueuePanel`, not fetched again — no extra ESI call for a number
  the page already has the inputs for. The two halves of the ratio therefore
  come from different snapshots, and `SummaryTile` takes `count` and `total`
  as separate props so an unloaded ceiling cannot blank out a count that did
  load. A revoked orders scope hides the whole ratio rather than rendering
  `— / 305`, which would read as "none used".
- **Wallet and Training queue share one row from `lg` up.** They stacked full
  width on every viewport, pushing the tiles and the notification feed below
  the fold on a desktop screen. The `aria-live="polite"` region stays on the
  training-queue wrapper alone — hoisting it to the new grid would start
  announcing wallet balance changes to screen readers, which was never the
  intent of that region.
