# Scope decisions — corp pay dialog: reason names the days, record payment, primary division

_Recorded 2026-11-22._

- **<Decision>.** <Why, and what it rules out.>

- **The Reason names the days it pays again**: the Miner's payment code, then the days the amount about to be sent pays (oldest first, `MM-DD` or `MM-DD/MM-DD`), inside EVE's 40-character limit. Money still pays the oldest day whatever the Reason says; the days are for the corp's officers reading the journal. The explanation of the code is an info tooltip, not text on the page. The "You owe … 1 day, oldest …" line is dropped from the dialog: the amount already says it.
- **Record payment is back for a book's Payee**, donation only. It stores a `recorded` payment link to the book's Payee. It counts as a donation in flight (paid, no action asked), dated to its day, until the member's own wallet shows the same transfer (then that one counts, never both) or the book credits it.
- **A donation the book read its wallet 2 hours after, and still does not hold, stops counting** (was 3 days after, `UNCREDITED_AFTER_DAYS`): the wallet journal is cached an hour. The existing "{corp} hasn't credited your donation" item is the "did not show on the corp wallet" signal, and the owed amount shows again.
- **A book picks a primary division** when it reads several (`primaryDivision` on the book doc, additive; absent means the first division). Members are asked to pay into it; a donation into any other division the book reads is credited all the same.
- **No "won't pay" on a book.** The book bills what is owed; only its officers waive it. A member disputes a day or declares they paid another way.
