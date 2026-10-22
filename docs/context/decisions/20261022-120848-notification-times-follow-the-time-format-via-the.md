# Scope decisions — Notification times follow the Time format via the zone, read from Dexie in the push handler (issue #4731)

_Recorded 2026-10-22 · issue #4731._

- **The zone is threaded through, not labelled.** The push handler runs in the service worker, but the preference is a plain Dexie `settings` row and the worker already imports `db` (it reads the character's name from it). `lib/timeFormat.ts`'s `readTimeZone()` reads that row directly, so no hydrated store is needed. `PushEnv.timeZone` hands the zone to `renderEveNotification`, whose trailing `timeZone` argument keeps it pure. In the app, `eveNotificationText` reads `useTimeFormat.getState()`, as `pollDomains/calendar.ts` does. This rules out an explicit "19:42 EVE" / "19:42 local" label: it would put a second wording on a surface that every other time in the app renders as a bare clock, and the worker can read the setting reliably.
- **An unreadable setting is the host's zone.** `readTimeZone` never rejects, and an absent or unparseable row is `'local'`, the default. A push is never held back or silenced over a preference read.
- **Delivered text is not rewritten.** A notification or feed row already stored keeps the clock it was rendered with. Changing the setting affects text composed afterwards.
- **Date-only due dates follow the same clock.** `formatLocalDate` takes the same zone, so a due date lands on the day the pilot's chosen clock shows. `formatLocalDateTime` gains the zone argument and uses `hourCycle: 'h23'` on the UTC path (never `24:05`); the local path is byte-identical.
