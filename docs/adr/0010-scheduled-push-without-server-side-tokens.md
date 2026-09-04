# 0010 — Push notifications are scheduled from client projections; the backend holds no EVE token

## Status

Accepted (2026-09-03)

## Context

Delivering a notification while the app is closed appears to require a server
that polls ESI, because CCP publishes no webhook — not for the endpoints round
20's Notification Events are synthesized from, and not for
`/characters/{id}/notifications/` either. A polling backend needs a refresh
token per Character, which reverses ADR 0001 ("tokens never leave the device")
and CONTEXT round 20 ("no true server push").

It is worse than a straight reversal. EVE SSO rotates refresh tokens: every
`grant_type=refresh_token` call may return a new one that must replace the old.
A device and a server cannot share a token — whichever refreshes first silently
invalidates the other — so preserving device-local auth alongside a polling
backend means a **second, independent SSO grant per Character**. At nine
Characters that is nine extra authorizations, plus encrypted server-side token
storage, key rotation, a consent and revocation UI, and ownership of the ESI
error-limit budget, which is per client id and therefore shared across every
user of the application.

None of that is necessary, because the events worth waking someone for already
carry the answer. A skill queue entry knows its `finish_date`. An industry job
knows its `end_date`, fixed when the job started. A planetary extractor knows
its `expiry_time`, a structure its `fuel_expires`, a calendar event its
`event_date`, and a `StructureUnderAttack` notification carries the `timeLeft`
from which round 36 already derives a reinforcement timer. These are scheduled
facts, not state changes that must be discovered by polling.

## Decision

The client **projects**: while the app is open it reads those timestamps and
uploads a Projection — one row per occurrence, carrying an Occurrence Key, a
`fireAt`, and already-rendered title and body — covering the next 72 hours.
A scheduled Cloud Function fires whatever is due through FCM.

**The backend holds no EVE token and makes no ESI call.** It stores rows and
sends them at the appointed time. It has no SDE, no i18n catalog, and no notion
of what a skill or a structure is.

## Considered Options

- **Server-side token custody (rejected).** Covers every event, including the
  unpredictable ones. Costs the ADR 0001 reversal, 2N authorizations, encrypted
  token storage, and shared error-limit exposure across all users.
- **Server as sole token holder (rejected).** Fewest logins — the client would
  obtain access tokens from the backend — but it makes the backend a hard
  dependency of the login path for the whole application, so an outage locks
  every user out rather than merely stopping notifications.
- **Accept foreground-only delivery (rejected).** The status quo, and the
  problem being solved.

## Consequences

- ADR 0001 survives verbatim. No token leaves a device, no second SSO grant
  exists, nothing new needs disclosing to users, and the blast radius of a
  compromised backend is notification delivery, not ESI access.
- **Only timestamped events can be delivered while closed.** Mail, wallet,
  market orders, contracts and the non-projectable EVE Notification types fire
  when the app is open and not before.
- **The backend cannot verify a Projection before firing it.** Pause a skill
  queue, cancel a job or refuel a structure in-game while the app is closed and
  the push still arrives. Wording absorbs this: assert for skills and industry
  jobs, which rarely change once queued; hedge for structure fuel, where a
  refuel makes the alert plainly wrong.
- **Delivery has a 72-hour half-life.** A device not opened inside the
  Projection Horizon stops receiving pushes until it is, degrading to the
  previous behaviour rather than failing.
- The upload path is one callable writing with admin privileges, so the
  projection and device-registration collections are function-only in the
  Firestore rules rather than following the ownerHash pattern. That is a
  consequence of the per-Character Firebase uid (`char:{id}`), not of this
  decision, but it lands here because the Projection is what needed uploading
  for every Character at once.
- De-duplication must happen on the device, not the backend: the backend cannot
  see that a foreground poller already fired the same occurrence locally. This
  is what makes the Occurrence Key load-bearing rather than a convenience.
