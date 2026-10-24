# Scope decisions — Corp Tax Book start date is editable by a Director

_Recorded 2026-10-23._

- **A Director can move the book's start date in Settings › Billing, through `updateSettings`.** Earlier is always allowed (not before a former moon owner's leave day, not in the future); the corp-default rate dated at the old start moves with it. Later is allowed only while no issued Statement covers a day between the old and new start, so billed days stay billed. Mining before the start stays history that owes nothing. Rules out a reset-by-delete as the only fix for a wrong start.
- **`updateSettings` can end the member setup window.** `showToMembers: true` sets `membersSeeFrom` to the call time (Director only); an additive field write, no new field.
