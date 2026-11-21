# Scope decisions — A Corp Tax Book bills the ore it takes, so a personal Payee is owed only what is left

_Recorded 2026-11-21._

Found by the mixed browser specs (`e2e/miningTaxMixed.book.spec.ts`); builds on decision
20261120-235011 ("every Payee is paid oldest first").

- **A day's ore is billed once, to whoever holds it.** The overlay already shows a row as what
  stays with a personal Payee when a book takes part of its Default System Assignment (`trimmed`),
  or all of it (`absorbed`: the corporation's own stored Payee, or a Default System day taken whole),
  and what another Payee's book also bills (`alsoBilled`). The Payee's Running account is built from
  the stored Assignments, so it ignored the first two and billed the whole Assignment again: Rook
  owed 1,000,000 for a day whose row said 400,000 while the book billed the other 600,000, and a
  corporation's own stored Payee billed every day its book had taken over. The stored share each
  Assignment is billed elsewhere (`billedElsewhere`) is now the one figure built from all three
  (`billedElsewhereOf`); a day billed elsewhere in full is no charge of its Payee, not a zero line.
- **The books read an Assignment as its Payee's account stands before any book takes ore off it.** A
  Default System's day is the book's to take only while unpaid. Read after the take, a trimmed day
  paid by exactly what is left would turn paid, stop being takeable, grow back to its whole bill,
  turn unpaid and be taken again, with no fixed point. The overlay's input is built without
  `billedElsewhere`; every other reader still sees the figure with it.
- **Left as it is: a Conflict day counts on both cards until it resolves.** The book's card reads
  the book's account (`bookOwes`), which bills a Conflict day regardless, while the Conflicts card
  says it is not owed yet and the pilot's own Payee holds it too, so the headline sums it twice for
  up to 14 days. Changing it moves the book's card off the book's own account; it is the owner's call.
