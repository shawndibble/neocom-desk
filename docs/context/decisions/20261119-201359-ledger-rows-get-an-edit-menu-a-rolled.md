# Scope decisions — Ledger rows get an edit menu; a rolled-over balance is an opening balance

_Recorded 2026-11-19._

- **Each row of a Miner's account ledger has a row menu** (right-click, touch-and-hold, ⋮, officers only), offering only what changes that row: a correction is edited or reversed, a write-off is reversed, a Market adjustment is charged ("don't forgive this") or changed ("forgive up to"), a payment is marked not tax, a mined day has its rate changed or its tax dismissed. A reversed row and its reversal carry no menu.
- **Nothing is deleted.** A reversed correction or write-off stays, struck through and tagged "reversed", with an offsetting row dated the day it was undone saying why, so the ledger still adds up. An edit shows the old row reversed and the new one beside it.
- **A correction an issued Late notice listed shows a disabled item** saying it can only be offset by an opposite correction (D22).
- **Set balance writes an opening balance.** It is an Adjustment with `kind: 'opening'`, dated at the book's start unless the officer picks another day, and labelled "Opening balance from the old system" unless they write another label. The ledger reads it as "Opening balance: ...".
- **The Payments table and the interactions feed leave out reversed corrections** (the ledger shows them); the export gains reversal columns.
