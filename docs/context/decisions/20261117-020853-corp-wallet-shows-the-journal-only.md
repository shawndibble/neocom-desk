# Scope decisions — Corp Wallet shows the journal only (issue #6320)

_Recorded 2026-11-17 · issue #6320._

- **`/corp/wallet` draws the journal only.** The Journal / Transactions switch, `CorpTransactionsPanel`, its columns and its CSV surface (`corp-wallet-transactions`) are deleted. The division's fills are still read, because the journal's market lines name their item from them; they are never drawn. An old `?view=transactions` link (and `/wallet/transactions?owner=corporation`) lands on the journal. No ESI scope changes: the Transactions view and the journal share the corp wallet scope. Rules out a second, per-division fills ledger on the Corp side; the character's fills stay on Market's History tab.
