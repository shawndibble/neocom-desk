# Scope decisions — Tolerance is its own dated ledger row

_Recorded 2026-11-19._

- **Each day a tolerance forgives is its own `tolerance` row (shown as "Market adjustment") in the Miner's account ledger, dated by the payment that closed the day**. It replaces the one undated tolerance-and-corrections row, which grew with every forgiven day and could not be told apart from a bug.
- **There is no catch-all row.** A gap an officer cannot act on (an Adjustment moves both sides equally) only caused confusion. Every difference is a close-out row for the day it belongs to, labelled "Market adjustment" (usually the close-of-day price against the price paid at); a test pins that the rows add up to the balance.
- **The row is derived, not stored.** It cannot be edited or deleted yet; editing it needs a stored per-day exemption (a new, additive Firestore field), which is a separate decision.
- **A price move only explains it when the Miner paid on the day they mined.** Paid after the day closed, both sides use the same close-of-day price, so the row's note says the payment was short rather than blaming the market.
