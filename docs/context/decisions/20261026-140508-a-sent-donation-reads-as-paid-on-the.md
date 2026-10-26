# Scope decisions — A sent donation reads as paid on the member's side

_Recorded 2026-10-26._

- **A day covered by a donation the member sent, that the corp's book has not credited yet, reads as Paid and owes nothing.** There is no "Sent, waiting for the corp" state, pill or hint any more, and the row offers no Pay. The member keeps their own books: once they sent the ISK, their side is done. If the corp disagrees, its book bills them again and they sort it out in game or on Discord. Rules out showing such a day as owed, which invites paying twice.
- **The Paid hint is "Paid to <Corp>."**, true whether the book credited the payment or the member's own wallet shows it sent. It used to say "Credited by <Corp>'s book."
- **Supersedes** 20261018-134402 ("A donation shows 'Sent, waiting for the corp' until credited") and the per-day status kept by 20261026-133731.
- The Corp Tax Book mockups (`src/mockups/corpTaxBook*`) keep the old state as design history.
