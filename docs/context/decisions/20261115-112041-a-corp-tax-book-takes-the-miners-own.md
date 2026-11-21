# Scope decisions — A Corp Tax Book takes the miner's own Assignments by quantity (issue #6203)

_Recorded 2026-11-15 · issue #6203._

Supersedes the "whole-or-nothing" sentence of
`20261103-154453-default-systems-a-payee-auto-assigns-the-moon.md` (Corp Tax Book bullet).

- **A book takes the miner's own Assignments by quantity, per ore type.** An Assignment to the
  corporation's own Payee, and an unpaid Assignment a Default System made, each give the book what
  it recorded of them, up to its share of the entry. Own-Payee Assignments are taken first. Several
  books in one system each take their part; what no book took stays with the Assignment's Payee,
  and the Tax tab shows that Assignment shrunk to what is left, valued in proportion at the
  books' hub prices of the day. A Default System's Assignment is never a Conflict.
- **Only the excess of an over-listed own-Payee Assignment is a Conflict.** The book bills its
  share in full; the ore the member listed for the corporation beyond what any book recorded is an
  `overListed` Conflict line. The book never recorded it, so the book never bills it and it never
  resolves to the corporation: the line reads "—", "Not billed". Ore another book contests stays
  on the Assignment and is that book's ordinary Conflict. On a day a Late notice listed, or one the
  corporation dismissed, no excess line is made and the ore stays on the Assignment.
- **A Conflict says why.** An own-Payee Assignment that needs review reads "Your own entry for
  {corp} needs review", not "another Payee". When a Collector's book recorded the ore at a moon
  owner's refinery and the member gave it to a Payee verified as that moon owner, it reads
  "{collector} now collects tax for {owner}'s moon. If you already paid {owner}, ask an officer of
  {collector}."
- **Disputed is checked per book.** On a day several books split, each book's quantity is
  compared with its own share of the member's entry, not skipped.
- **A Conflict's hint names both deadlines:** it resolves on the 14-day date or once a
  Late notice lists the day, whichever comes first.
