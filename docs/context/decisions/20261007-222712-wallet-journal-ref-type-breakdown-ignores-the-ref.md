# Scope decisions — Wallet journal ref-type breakdown ignores the ref-type filter and is shared with the corp journal (issue #2858)

_Recorded 2026-10-07 · issue #2858._

- **The breakdown ignores the ref-type filter** but honors date range and text. Otherwise picking a type would collapse the table to one row and hide the other types it exists to compare. A row click toggles the ref-type filter.
- **The corp journal gets the block too.** `JournalTable` is shared by `/wallet` and `/corp/wallet`; gating it would cost a prop for no benefit. All Characters is #2846.
