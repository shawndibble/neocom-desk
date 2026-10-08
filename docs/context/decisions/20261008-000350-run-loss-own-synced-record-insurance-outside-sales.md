# Scope decisions — Run Loss: own synced record, insurance outside sales tax (issue #2851)

_Recorded 2026-10-08 · issue #2851._

- **A Run Loss is its own record (`productionLosses`), several per run, synced like a sale link.** A loss is not a sale link with a zero price: sale-link revenue is taxed and counts toward Units sold, a loss is neither. One document per loss keeps two devices' edits independent and lets "Remove loss" tombstone exactly one.
- **Realized profit keeps charging the whole run cost.** A loss does not change that rule. It writes the lost units off Unsold cost and Open inventory value, and the insurance payout is added to profit after fees (no sales tax or broker fee on it). Worked example: 5 of 12 Rifters lost at 750,000 each with 1,500,000 insurance gives a net loss of 2,250,000 and Realized profit rises by the insurance only.
- **Net loss (cost written off − insurance) is shown on its own line** (the profit breakdown), never folded into the Realized profit figure.
- **The Records chart keeps its existing dating rule:** a run's profit (now including insurance) lands on the run's `loggedAt` day, same as sales, since sales are not dated separately there.
- **Insurance sources:** a wallet-journal entry with `ref_type === 'insurance'` and `amount > 0` (premiums are negative debits and are excluded), typed ISK, or none. The picked journal entry id is part of the loss id, so one payout cannot back two losses. A Character without the wallet scope can still type ISK.
- **No row right-click menu** was added: the Sold… dropdown already carries the action (DESIGN.md §6c restraint).
