# Scope decisions — A Payee named exactly as a book's corporation is that corporation

_Recorded 2026-11-17._

- **A member's Payee is a Corp Tax Book's corporation when it carries the corporation's id; failing
  any such Payee, when it has no link and is named exactly as the corporation.** EVE names are unique
  (case-insensitively), so an exact name is the corporation. A Payee that lost its link on one
  device made every day the member settled to it read as a Conflict, listed the corporation as
  "another Payee" and split its balance in two. Judged per Character (Payees are per Character).
  This supersedes #6205's "the link is a suggestion, not automatic" (decision
  20261115-114019) for a Payee with no link at all: a same-named unlinked Payee stays a separate
  label only when a linked Payee for the corporation exists beside it. A Payee carrying the id with
  no kind recorded counts too.

- **Such a Payee is given the link, and it syncs.** When the Tax tab reads a book, and when a
  payment to the book is recorded, a matching Payee missing its link is linked (`entityId`,
  `entityKind: 'corporation'`), so every device reads it the same way. Never a Payee linked to
  another corporation or a character, whatever its name.

- **A payment never re-points a verified Payee.** Learning who a Payee is paid from a linked
  payment (`rememberPayeeEntity`) fills an unlinked Payee, or updates one whose id was itself only
  learned from a payment; a Payee verified as a corporation or character keeps its link. Paying a
  corporation's CEO or an officer once had re-pointed the member's corporation Payee to that
  character, and the book stopped counting it as its own.
