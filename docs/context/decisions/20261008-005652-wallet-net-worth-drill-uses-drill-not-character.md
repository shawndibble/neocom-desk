# Scope decisions — Wallet net worth drill uses ?drill=, not ?character= (issue #2935)

_Recorded 2026-10-08 · issue #2935._

- **The Wallet net worth drill-down is route state in `?drill=<characterId>`, not `?character=`.** `?character=` is the alert deep link: `AlertCharacterSwitch` makes that Character active and strips the param on sight, so a drill written there is erased within a frame and would also switch the active Character. Browser Back still undoes the drill (each drill is a pushed history entry). #2936 (landing pages that open for a chosen Character) should pick its own param for the same reason.
- **Net worth totals include only Characters holding the wallet, assets and orders permissions** (the same three a Net Worth Snapshot needs). A Character short of one is left out of totals and named by the scope readout ("All characters · N of M"); its table row says why.
- **Sell-order stock is a new optional `sellStock` field on the snapshot row** (`volume_remain x price` over the Character's own sell orders; corp-placed orders skipped). Rows written before it existed read as 0; no migration.
