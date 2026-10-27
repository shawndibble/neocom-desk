# Scope decisions — Add calendar RSVP write scope to base grant

_Recorded 2026-09-21._

- **`esi-calendar.respond_calendar_events.v1` goes in the base grant**,
  alongside `esi-calendar.read_calendar_events.v1`, not a new opt-in
  `ScopeGroup`. It's a paired write for a read the app already asks every
  character for, the same shape as `esi-mail.organize_mail.v1` sitting next
  to `esi-mail.read_mail.v1` — RSVP is only useful where the calendar
  already is, so gating it behind a separate opt-in step would just be
  friction with no matching benefit (unlike `corp`/`structureMarkets`,
  which are genuinely optional feature areas).
- **Existing characters are not retroactively granted it.** `TokenRecord.scopes`
  (`src/db/index.ts`) is fixed at whatever was granted at last login;
  `app/loginFlow.ts`'s scope union only affects future logins. Every
  character who authorized before this shipped will hold a token missing
  this scope until they reconnect once.
- **No bespoke "reconnect to enable RSVP" gate was built for that.** The app
  already hit this exact situation for `organize_mail` (issue #741,
  `src/features/character/mail.ts`'s `markMailReadOnEsi`) and the chosen
  fix there was: attempt the write, and on a 401/403 call
  `emitEsiAuthFailure` so the existing shell-level `AuthFailureNotice`
  banner (`src/app/AuthFailureNotice.tsx`) offers a one-click reconnect.
  `respondToCalendarEvent` (`src/features/character/calendar.ts`) follows
  the same contract. Building a `useGrantedScopes`-gated inline prompt
  (the `useCorpAccess`/`CorpGrantPrompt` pattern from the corp-roles
  decision) was considered and rejected as duplicating a solved problem —
  that pattern earns its cost only for a genuinely optional feature area
  where silently failing would look like a bug rather than a stale grant.
