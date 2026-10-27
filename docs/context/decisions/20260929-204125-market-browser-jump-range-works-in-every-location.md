# Scope decisions — Market Browser Jump Range works in every Location Mode

_Recorded 2026-09-29._

- **A set Jump Range replaces the header's scope.** Market Browser's
  Distance filter now shows in Trade Hub mode as well as Region mode. Once a
  range is set and measurable, the order book fans out over every region
  holding an in-range system (the same narrowed fan-out All regions already
  used) and drops the Trade Hub's one-station filter. Before, a range only
  narrowed what the header had fetched, so "within 5 jumps" needed Region →
  All regions to reach past one region. It rules out the old reading that a
  range picked with one region selected stays inside that region: it now
  crosses region borders.
- **"Any distance" reads as the header's scope.** In Market Browser, the
  no-range option is labelled with what the book falls back to: the Trade
  Hub's system, the picked region, or "All regions". The "From: {system}"
  picker shows only once a distance is picked. BPC Sourcing and Contract
  Search keep "Any distance".
- **Security and NPC stations only follow the book, not the mode.** They
  show and apply whenever the book spans stations: Region mode, or a set
  range in Trade Hub mode.
- **The filter bar shows before an item is picked**, so the range can be set
  before searching.
- An unmeasurable range (no Current System, no stargate graph) falls back to
  the header's scope, with the existing note explaining why. Variations,
  Compare, Item Detail and Price History keep the header's scope, as they do
  under All regions.
