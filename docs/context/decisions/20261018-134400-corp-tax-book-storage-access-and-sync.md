# Scope decisions — Corp Tax Book storage, access and sync (issue #4055)

_Recorded 2026-10-18 · issue #4055._

D-numbers are the decision numbers in epic #4055.

- **The book is synced, shared by every officer (D1).** It lives in Firestore
  with dismissals (and who made them), manual records and everything else, so
  every officer sees one book. A new exception to API-Derived Data; ADR 0023.
- **Officer access is checked by a Cloud Function from a short-lived access
  token; every write goes through a callable into an audit log (D7).** The
  mechanism is ADR 0023. In scope: the audit log is shown as an activity feed,
  and the CEO can always reclaim the book.
- **Roles (D8).** View: CEO, Director, Accountant, Junior_Accountant. Edit
  (rates, dismiss, mark paid, unlink, mail, the minimum Statement): CEO,
  Director, Accountant. Extraction timers also need Station_Manager. Turning
  the book on needs a Director. Reading the observer ledger from ESI uses a
  new `canReadMiningLedger` capability (Accountant, Director, CEO); it gates
  who can sync, not who can view the book.
- **Any officer's client syncs on visit (D9):** observers, Extractions and
  journal donations, upserted monotonically (ADR 0023). The book shows "Last synced 3d ago by X", warns after about 3 days, and shows
  lost history loudly ("Gap: 3–5 Jul, Athanor X — unrecoverable").
- **No server-side scheduled sync in v1 (D25).** A CEO opt-in narrow grant
  would change ADR 0010; filed as a follow-up (#4068).
- **A start date, picked by the Director who turns the book on (D10).**
  Mining before it is kept as "Before the book" and owes nothing.
- **A book only knows characters that mined at its refineries.** Only Athanor
  and Tatara refineries have an observer ledger; Metenox has none.
