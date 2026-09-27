# Scope decisions — Assets item columns ship at item rows only; container rows deferred (issue #2034)

_Recorded 2026-09-26 · issue #2034._

- **The md+ Quantity / Volume / Value columns and label strip ship on item rows only (slice 1).** Location and container rows keep their current shape, so the strip's figures sit under item rows alone. Whether ships and containers should gain matching Items / Value cells is deferred until the strip has been seen on real data; it is a follow-up ticket, not part of #2034. `ItemRow` is shared with Corp Assets, so that view gets the same columns and strip. Phone layout is unchanged.
