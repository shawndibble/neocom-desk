# Scope decisions — Adjustment can set a Miner's balance

_Recorded 2026-11-19._

- **The Adjustment dialog has a third direction, "Set balance".** The officer types the balance a Miner should have (owes X, or holds X credit); the dialog works out whether a charge or a credit moves it there, and by how much, from the balance now (Owed less Credit). It is for rolling a Miner over from another system.
- **It records an ordinary Adjustment.** Nothing new is stored: the amount is worked out when the officer confirms, on the day they pick, with their label as the reason. The balance can move between the preview and the confirm (a payment arriving); the Adjustment is a fixed amount, not a target that is re-evaluated.
