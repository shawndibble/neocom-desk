# Scope decisions — Open Orders rows say what is happening, not just which badge

_Recorded 2026-09-06._

- **Every row carries one plain-English sentence beside its badge.** The badge
  names the Order Problem; it never says the rival's own price, the ISK gap, or
  whether following that rival would still clear the Order Floor. A page of
  badges and percentages reads as a diagnosis with the finding left out, which
  is what the first build shipped. `orderRowSummary` is the one place those
  facts are chosen, and it returns FACTS, never a formatted string — the
  sentence is a single interpolated i18n key, so it stays translatable.
- **The sentence only ever states what the tier in hand can back.** The
  always-on station tier is a Fuzzwork aggregate: a price, never an order
  count. So "3 sellers under you" appears only once the deep region-book check
  has run for that item, and never from the aggregate. This rules out the
  richer wording the mockups showed for rows whose deep check has not run.
- **A group header states its own summary, on screen.** What the group means,
  the ISK it holds, the worst gap in it, and — with more than one character —
  whose orders they are. That description used to live only inside the "?"
  tooltip, which meant a folded or long group could not be judged without
  opening it. The tooltip is gone rather than duplicated.
- **The whole filter set collapses behind the funnel at every width on this
  page.** A chip per Order Problem plus three selects is two full rows above
  the worklist they exist to narrow. `FilterBar` gained an opt-in
  `collapsible` prop rather than changing behaviour for every route that
  already uses it; the active chips stay outside the box, where they can be
  seen and dropped. There is no draft on the pointer-width surface — only the
  narrow sheet has Apply/Cancel.
- **"Off hub" is claimed only for a location this app resolved.** An
  unresolved player structure reads as unknown, never as off hub.
- **The detail modal's scope table keeps five columns.** One seller at your own
  station is, by construction, also the cheapest in your system and can be the
  cheapest in the region — so all three scopes routinely quote the same ISK
  figure. Three identical numbers on three bare rows read as a bug; the same
  three beside the station they sit in, the gap, and the distance read as what
  they are. Deferred with it: the "is there a better exit?" comparison and the
  per-order "this order so far" ledger, which need the hub-gap work and
  per-order fill tracking respectively.
