# Scope decisions — Corp Tax Book personal tab: how the member's rows meet the book (issue #4065)

_Recorded 2026-10-18 · issue #4065._

- **The book bills what it observed, not what the member's ledger holds.** The
  member's own ore only attributes (several books split by observed quantity,
  the book's share comes from ore given to no Payee, the rest is a conflict).
  A member and the corp's Statement must show the same amount, so the owed
  quantity is the book's, even when the personal ledger is smaller; the diff
  modal shows the difference.
- **A conflict is raised when its day closed, not when the member first saw
  it.** It resolves to the corp 14 days after day end plus the book's grace.
  Deterministic and needs no stored timestamp; the row prints the resolve date
  as the notice. Ruled out: a per-device "first seen" record, which two
  devices would disagree on.
- **A day on an issued Statement is never a conflict.** The Statement is the
  corp's frozen decision; it is owed in full.
- **The corp Payee is virtual.** "<Corp> (Corp Tax Book)" exists only in the
  tab, never in Dexie, and is excluded from every assign, split, join, continue
  and settle-up path, so no Assignment can point at it. Settle up for it is a
  how-to-pay dialog: the book credits the donation from its own wallet journal.
- **A donation in flight is recognised by sender, amount and time.** The
  corp's journal ids differ from the member's, so a held payment within ten
  minutes with the same amount from the same Character is the same transfer.
- **Unattributed and Pending are relabels of the unassigned row, not rows.**
  The member keeps the Assign actions and the row leaves the "needs assigning"
  count, because nobody is owed.
- **A leaver keeps reading.** A corporation whose book a Character has been
  read in is remembered per Character, so after leaving the book is still read
  and the Payee stays, with a note, rather than disappearing with the debt.
- **Observed rows may carry `solarSystemId` and `moonId`.** The book stores the
  refinery only; the personal ledger knows only the system and a member cannot
  read extractions. The syncing officer's client (#4062) should send both;
  until it does, rows line up by character and day and per-moon rates fall
  back to the next most specific rate.
- **A player claims their own Unmatched donation through a callable** keyed on
  the caller's uid (the donor's), audited as `claimPayment`; someone else's
  donation answers exactly like a missing one.
