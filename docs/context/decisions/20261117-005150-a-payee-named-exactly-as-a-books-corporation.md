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

- **A Payee is always someone in EVE: a corporation or a character.** Adding or renaming one in
  Manage Payees saves only a picked suggestion or a name that is exactly one corporation or
  character (an exact-name `/universe/ids` lookup, `lookupPayeeName`); no match, a failed lookup or
  an alliance saves nothing and says why, and a name a corporation and a character share asks the
  pilot to pick. The Survey's Assign Taxes creates a Payee only the same way and otherwise explains
  in its row. This replaces "a moon or place name must always be saveable" (free-text Payees): an
  unlinked Payee is what made a member's book days read as Conflicts, and it can never be paid.
  Alliance-linked Payees from before keep working and stay editable; only new ones are limited.
  Editing a linked Payee without renaming it asks ESI nothing.

- **Unlinked Payees from before are linked where the name allows, and flagged where it doesn't.**
  The Tax tab looks every unlinked Payee's name up in one batched call, once a session per Payee,
  and links an exact single corporation match by id alone (`rememberPayeeEntity`, synced; no kind,
  so a later confirmed payment can still correct it). A name that is a character is never linked
  unasked: "Bob" or "Landlord" is some stranger. The rest are one Tax tab attention item opening
  Manage Payees, and their rows there read "Not found in EVE — edit to pick who this is" (the row's
  Edit carries the fix, so no extra control). A failed lookup flags nothing: an outage is not
  "nobody in EVE". An old unlinked Payee is never locked: saved under its own name it keeps its
  rate, hub and systems edits, and stays flagged; renaming any linked Payee asks EVE again.
