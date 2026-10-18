# Scope decisions — Corp Tax Book storage, access and sync (issue #4055)

_Recorded 2026-10-18 · issue #4055._

- **The book is synced, shared by every officer (D1).** It lives in Firestore
  with dismissals (and who made them), manual records and everything else, so
  every officer sees one book. A new exception to API-Derived Data; ADR 0023.
- **Officer access is checked by a Cloud Function from a short-lived access
  token, never the refresh token (D7).** Read access is cached for 10 minutes
  or less and lapses after 24h without renewal. Dismissals, write-offs,
  rebills and "not tax" marks re-check the role live. Every write goes through
  a callable and appends to an immutable audit log, shown as an activity feed.
  The CEO can always reclaim the book.
- **Roles (D8).** View: CEO, Director, Accountant, Junior_Accountant. Edit
  (rates, dismiss, mark paid, unlink, mail, the minimum Statement): CEO,
  Director, Accountant. Extraction timers also need Station_Manager. Turning
  the book on needs a Director. Read access uses a new `canReadMiningLedger`
  capability.
- **Any officer's client syncs on visit (D9):** observers, Extractions and
  journal donations. Upserts are keyed by miner + ore + day + structure and are
  monotonic: quantity never goes down and an older ESI cache is ignored. The
  book shows "Last synced 3d ago by X", warns after about 3 days, and shows
  lost history loudly ("Gap: 3–5 Jul, Athanor X — unrecoverable").
- **No server-side scheduled sync in v1 (D25).** A CEO opt-in narrow grant
  would change ADR 0010; filed as a follow-up (#4068).
- **A start date, picked by the Director who turns the book on (D10).**
  Mining before it is kept as "Before the book" and owes nothing.
- **A book only knows characters that mined at its refineries.** Only Athanor
  and Tatara refineries have an observer ledger; Metenox has none.
