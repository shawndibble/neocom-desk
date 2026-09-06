# Scope decisions — Reprocessing v1 models the skills and states the rest as assumptions (issue #537)

_Recorded 2026-09-06 · issue #537._

- **What v1 models: the base station rate and the character's own skills.**
  Yield is `50% × (1 + 0.03 × Reprocessing) × (1 + 0.02 × Reprocessing
Efficiency) × (1 + 0.02 × specialisation)`, floored per material. Skill ids
  read out of this repo's own baked `skills.json`, not from memory:
  Reprocessing 3385, Reprocessing Efficiency 3389, Scrapmetal Processing 12196. Ore specialisations are the same shape and slot into the same
  `specialisationLevel` input; v1 passes Scrapmetal Processing, which is the
  one that applies to the modules and ships an open sell order actually holds.
- **What v1 will not pretend to know: the facility and the tax.** A player
  structure's own reprocessing rate, its rigs, and the standings-based station
  tax are not readable from ESI for an arbitrary location. So the 50% base is
  labelled on screen as an assumption ("assumes a 50% station, before any
  station tax"), never folded silently into a number presented as fact. An
  implant bonus is the same case and is also left out.
- **A part batch yields nothing, and the row says so.** `invTypeMaterials`
  quantities are per `portionSize`, not per unit — refining 3 units of a
  100-portion item returns nothing at all. `portionSize` was not baked before
  this, so it joins `types.json`, and the engine reports both the units it
  could actually refine and the remainder it could not.
- **The comparison is priced where the stock already sits.** Materials are
  valued against the same station aggregate the Open Orders page already
  fetches for competition, not against a trade hub: the item is at that
  station, and quoting Jita mineral prices for stock in Hek is a haul this
  comparison is not modelling. A material with no price at that station drops
  out and the row says the total is partial rather than under-counting it
  silently.
- **The only UI is the row that already exists.** `orderExits.ts` carries a
  greyed "reprocess and sell the materials — not built yet" line; this fills
  it in. No reprocessing panel, no Build Plan comparison, no assets view —
  the ticket names those as motivation, not scope.
