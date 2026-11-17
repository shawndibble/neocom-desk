# Scope decisions — A Payee named exactly as a book's corporation is that corporation

_Recorded 2026-11-17._

- **A member's Payee is a Corp Tax Book's corporation when it carries the corporation's id; failing
  any such Payee, when it has no link and is named exactly as the corporation.** EVE names are unique
  (case-insensitively), so an exact name is the corporation. A Payee that lost its link on one
  device made every day the member settled to it read as a Conflict, listed the corporation as
  "another Payee" and split its balance in two. This narrows #6205's "a Payee that only shares the
  name is a second Payee" to the case where a linked Payee already exists beside it: that one stays
  a separate label. A Payee carrying the id with no kind recorded counts too.

- **Such a Payee is given the link, and it syncs.** When the Tax tab reads a book, and when a
  payment to the book is recorded, a matching Payee missing its link is linked (`entityId`,
  `entityKind: 'corporation'`), so every device reads it the same way. Never a Payee linked to
  another corporation or a character, whatever its name.
