# Scope decisions — Pledges: stale clock, withdraw rule and board reads (issue #3808)

_Recorded 2026-10-14 · issue #3808._

- **A Pledge goes stale 14 days after its document was last written, with nothing delivered.** One timestamp per Member and Request (the rules bind it to the server time), not one per line, so updating one line refreshes the others. Stale Pledges stay in the totals and are greyed in words; nothing releases them.
- **Withdraw is offered only while nothing is delivered on that Pledge.** Withdrawing would erase the delivery record that #3809 writes; Update pledge stays available.
- **The board reads every Pledge of a Community in one collection-group query** on `communityId`, which each Pledge repeats (the rules bind it to the path). One read however many Requests are open; it needs the collection-group index and rule deployed by hand (`firebase deploy --only firestore`).
- **Known limit for #3809:** the rules deny writes to a Pledge once its Request is closed or expired, so a delivery cannot be marked late. A Member can still withdraw. Lifting this is a rules change, not a client one.
- **Rules validate only the lines a write changes.** Rules cannot loop, so the 50 line keys are unrolled; pledging line by line, as the panel does, stays far inside the 1000-expression budget. Measured on the emulator: a write that changes 4 lines at once passes, 6 does not. #3809 must mark deliveries in batches of at most 4 lines per write. (Partly superseded: batches are cost-based, `batchLines`, a measured budget as well as four lines, because contract ids add cost; see `20261015-010948-request-delivery-marking-manual-amounts-and-write-batching.md`.)
