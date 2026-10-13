# Scope decisions — BPC Sourcing breaks sort ties by source: owned, Community, LP store, then market and contracts

_Recorded 2026-10-13._

- **Whatever column the pilot sorts by, rows that tie fall back to a fixed source order: owned, Community, LP store, then market and contracts.** It is the order `rankBpcOffers` builds `displayRows` in, which the table's stable sort keeps for ties, so it needs no sort-key plumbing and is invisible in the UI. It replaces the earlier owned, Community, market, contract BPO, LP, contract order. Market and contracts share one rank: they keep their relative order (market, contract BPOs, contract copies) rather than interleaving.
