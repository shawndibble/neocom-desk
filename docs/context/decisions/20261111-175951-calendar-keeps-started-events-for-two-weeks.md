# Scope decisions — Calendar keeps started events for two weeks

_Recorded 2026-11-11._

- **A started calendar event stays on the board for 14 days after it began.**
  Shawn asked to keep historical calendar data for at least two weeks.
  `retentionEndsAt` is now `startMs + RETENTION_MS`; the end-of-local-day and
  six-hour run-out rules are gone, since two weeks subsumes both. This
  supersedes the "run-out, never a look-back" paragraph of
  `20260908-090259-a-calendar-event-survives-its-own-start-until.md`.
- **The history is partial, and the docs say so.** The device only retains
  events it saw before they started; ESI has no past-events endpoint. Days the
  app was never open for stay empty and hatched. The earlier worry that a
  partial past reads as a complete one was weighed and accepted for the value
  of seeing what you were invited to.
- **Unchanged:** started-or-not is still the only discriminator, so an upcoming
  event missing from a fresh read is still a cancellation. Next-deadline and
  `calendarEventStarting` ignore past events already, so neither changes.
