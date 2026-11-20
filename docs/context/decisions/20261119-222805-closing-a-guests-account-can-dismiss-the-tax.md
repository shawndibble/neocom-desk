# Scope decisions — Closing a guest's account can dismiss the tax; closed accounts leave the Miners table

_Recorded 2026-11-19._

Narrows decision 20261018-182323 (guest close-account rules).

- **Close-account offers a choice: a final late notice, or dismiss the tax.** The officer no longer has to press Dismiss tax first. Dismiss waives owed plus unbilled days, then the close sends no notice. Credit rules (refund, or forfeit with consent or after 90 days) are unchanged.
- **The dismiss-then-close is two edits, not one.** It supersedes "one `closeAccount` edit, not two calls" for this path only: the server's `dismiss` and `closeAccount` stay as they are, and a failed close is retried with nothing left to bill. The dialog's reason is used for both.
- **A closed account leaves the Miners table.** It is listed under a collapsed "Closed accounts" section instead, and no longer counts in the table's chips or summary. Closing is a write-off of the record from view; what is owed is not forgiven unless the tax was dismissed.
- **Dialog wording says late notice, not Statement,** matching decision 20261118-221839.
