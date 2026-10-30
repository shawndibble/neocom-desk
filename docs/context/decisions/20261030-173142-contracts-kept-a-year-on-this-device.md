# Scope decisions — Contracts kept a year on this device (issue #5655)

_Recorded 2026-10-30 · issue #5655._

- **Every live fetch of the Character's own contracts upserts headers into `contractArchive`, keyed by contract id per Character, pruned 365 days after the contract's last date.** Own table, not `esiCache` rows (replaced each fetch, wiped by "clear cache"). Matches `20261016-093013-wallet-journal-and-transactions-kept-a-year-on.md`. Saved-copy reads are not archived.
- **Item lines go in `contractItemArchive` only when the pilot opened the contract; never re-fetched for old ones.** An old contract with none shows "Items not kept for this contract".
- **Only Contracts › History reads the union (`loadContractsWithArchive`), live wins on a shared id.** Pollers and boards keep reading ESI's window. A `?highlight=` id in neither shows "This contract is older than 30 days and EVE no longer sends it."
- **Personal contracts only; not synced, not in the backup, removed with the Character.** Corp contracts get no archive. Listed in the FAQ under the device store and retention groups.
