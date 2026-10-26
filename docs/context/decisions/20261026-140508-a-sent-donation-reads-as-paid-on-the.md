# Scope decisions — A sent donation reads as paid on the member's side

_Recorded 2026-10-26._

- **A day covered by a donation the member sent, that the corp's book has not credited yet, reads as Paid and owes nothing.** There is no "Sent, waiting for the corp" state, pill or hint any more, and the row offers no Pay. The member keeps their own books: once they sent the ISK, their side is done. If the corp disagrees, its book bills them again and they sort it out in game or on Discord. Rules out showing such a day as owed, which invites paying twice.
- **Credit the book holds for no Statement yet pays the oldest Billed days too**, so a day stays Paid once the corp credits the donation that paid it, rather than flipping back to owed until a Statement bills it. A member with payments and no Statement yet now has them counted as credit (they were ignored), which the balance note shows as credit for the next Statement.
- **A day paid ahead of any Statement has no "the book decides this day" footnote in its detail view**: nothing is pending to explain.
- **The Paid hint is "Paid to <Corp>."**, true whether the book credited the payment or the member's own wallet shows it sent. It used to say "Credited by <Corp>'s book."
- **Supersedes** 20261018-134402 ("A donation shows 'Sent, waiting for the corp' until credited") and the per-day status kept by 20261026-133731.
- The Corp Tax Book mockups (`src/mockups/corpTaxBook*`) keep the old state as design history.
