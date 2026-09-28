# Scope decisions — Skill Detail prices the hub region and shows the NPC skillbook price

_Recorded 2026-09-28._

- **Skill Detail prices a skillbook from the hub region's order book, not the
  hub station's aggregate.** It shows two rows: lowest sell at the Trade Hub
  station, and lowest sell anywhere in the hub's region. NPCs seed skillbooks
  in NPC stations across a region, often not at the hub station itself.
  Upwell Hauler had zero sells at Jita 4-4 and 24 elsewhere in The Forge, all
  at 2,000,000. The old station-only aggregate read that as "No sell orders".
  The hub row stays so the station price is still visible where there is one.

- **The NPC price is the SDE `basePrice`, labelled as the fixed price where
  the book is seeded.** `skills.json` now carries `basePrice` (omitted at 0).
  Every NPC order for Upwell Hauler sat at exactly its `basePrice`. Not every
  skill is NPC-seeded, so the row makes no claim that one is on sale nearby.
  This does not tell NPC orders apart from player orders on the live book
  either. That stays as `bpAcqMarketHint` states it.

- **"Find nearby" opens Market over All regions with a 10-jump Jump Range.**
  The link sets `region=all&browser.jumps=10`, and Market measures the range
  from the Current System. The Jump Range stays URL-only, as every linked
  filter value is. Location Mode's All regions is adopted into the remembered
  default, like any other Market link (`20260926-201312`).
