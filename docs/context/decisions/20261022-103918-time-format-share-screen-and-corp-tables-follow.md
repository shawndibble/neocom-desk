# Scope decisions — Time format: share-screen and corp tables follow it; mail queue and notification text do not yet

_Recorded 2026-10-22._

- **The Share Link expiry/generated chips (D-Scan, Appraisal, Fitting) and the
  Corp Role Audit and Corp Transactions date columns follow the Time format
  preference.** They were bare `toLocaleString()` / `formatTimestamp` calls
  with no zone, so the pilot's setting silently did nothing there. Default
  `'local'` keeps today's output (minus seconds on the share chips, which now
  match every other `formatTimestamp` surface).

- **The Corp Tax Book mail queue's "sent" clock stays pinned to UTC.** It has
  always rendered an unlabelled `HH:MM` in UTC; routing it through a preference
  that defaults to `'local'` would change what an existing pilot sees, the same
  reasoning that excludes Industry's Active Jobs "Ends" column. Whether it
  should follow the setting is a user-visible-behaviour call, left open.

- **Notification text (`eveNotificationRender.ts`) stays on local time.** It
  is rendered outside React, partly in the push handler, with no subscription
  to the preference; threading a zone through it is invasive, and whether
  structure timers in a notification should be EVE time is a product call.
  Left open.
