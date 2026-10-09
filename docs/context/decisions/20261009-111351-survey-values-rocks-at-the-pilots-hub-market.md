# Scope decisions — Survey values rocks at the pilot's hub market, not the scanner ISK

_Recorded 2026-10-09._

- **A Survey's rocks are valued at market, not at the scanner's ISK column.** The scanner's figure is not always right, so `priceScans` drops it: a rock is its ore units times the ore's price per unit. The price is the highest buy order at the pilot's default Trade Hub (Jita unless they chose another; a visitor with no session gets Jita) of the ore's Compressed form where there is one, the same basis as the Moon Mining Tax ledger (`features/miningTax/pricing.ts`, Ore Form setting honoured). Everything downstream (ISK left, ore order, the value ramp, the chat message) reads the priced rocks unchanged.
- **An ore with no market price has no value, not a wrong one.** It reads gray and sorts by volume after the priced ores; with no prices at all (Fuzzwork unreachable) the ISK figures are hidden as before.
- **The unit convention is the ledger's.** Units times the compressed type's unit price, as `computeAssignmentValue` does; no compression-ratio factor.
