# Scope decisions — A Payee verified as the corporation is the Corp Tax Book's own Payee

_Recorded 2026-11-01._

- **The book's Payee is named for the corporation, with no suffix.** The "(Corp Tax Book)"
  label is gone from the Tax tab. Supersedes the naming part of D12; the Payee is still
  virtual and display-only.
- **A stored Payee is the book's own when its verified entity is the corporation** (entity
  kind corporation, same id). Never by name: a same-named free-text label is not the corp.
  Ore the member gave it is not "another Payee's": no conflict, and its row gives way to the
  book's, which bills the same ore. It is taken over only when the book's share for that day
  covers everything it lists; a Payee that listed more than the corp observed keeps the
  conflict for the excess.
- **Paid on the member side, confirmed by the corp.** What the member paid under that Payee
  covers the book's row for the same ore (Paid, or owing the rest), the way an in-flight
  donation does. The corp still verifies against its wallet: a donation to the corp is
  matched and claimed by the existing flow. A payment the wallet never shows needs an
  officer to see and accept or reject it; that report to the corp is not built here.
