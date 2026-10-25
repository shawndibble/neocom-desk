# 0020 — Closed-app push for unpredictable EVE notifications: a server polls `/notifications/` under a narrow, opt-in Alerts Grant

## Status

Accepted (2026-10-18). Amended by ADR 0027: the grant may also carry the
location scope, for nearby alerts.

## Context

ADR 0010 delivers push only for events that are scheduled facts (a skill queue
entry's `finish_date`, a job's `end_date`, an extractor's `expiry_time`). It
rejected server-side token custody and left everything else — a
`StructureUnderAttack`, a war declaration, a faction-warfare warning, a death
report — firing only while the app is open. For those, minutes matter, and ESI
has no webhook: the only way to learn of them while the app is closed is for a
server to poll `GET /characters/{id}/notifications/`.

ADR 0010's reasons for refusing token custody were real: a refresh token per
Character on a server reverses ADR 0001; SSO rotates refresh tokens, so a
device and a server cannot share one (a second, independent authorization per
Character is unavoidable); and encrypted storage, revocation and the ESI error
budget all become the backend's problem. This ADR accepts those costs, because
the feature is wanted, and shrinks their blast radius:

- The server needs **one scope**, `esi-characters.read_notifications.v1`. A
  leaked Alerts token can read a Character's notification feed and nothing
  else — no assets, wallet, mail or skills. The device's own full-scope login
  and token never leave the device.
- The endpoint is a **single feed** that already carries every type the app
  knows how to display. The user already chooses which types matter per
  Character and per channel (`eventSelection.ts`'s `EveTypeEnabledMap`, Settings
  → Notifications). The server does not need an event catalog; it needs those
  choices.
- ESI caches the endpoint for about 10 minutes and supports ETags, so polling
  every 15 minutes (the same cadence as `dispatchProjections`) bounds delivery
  latency to roughly 25 minutes in the worst case and is cheap.

Cost was checked against the October 2026 GCP bill. Function compute is
covered by the free tier; a new scheduled job adds about $0.10/month for
Cloud Scheduler past the three free jobs; token-doc reads at 15-minute polling
are ≈96 per Character per day. The existing spend is Firestore egress from the
contract snapshot (ADR 0019), not anything this feature touches.

## Decision

Add an opt-in **Alerts Grant** and a scheduled poller. Server-side delivery
covers every EVE notification type a device has enabled for the browser
channel.

- **Alerts Grant.** A separate SSO authorization per Character, requesting only
  `esi-characters.read_notifications.v1`, started from an explicit per-Character
  "Get alerts when closed" control. The browser completes the PKCE flow, then
  calls one callable that verifies the access token (`verifyEveToken.ts`, as
  `registerDevice` does) and hands over the refresh token for custody. The
  Character's main login is untouched.
- **Where a user turns it on.** Settings → Notifications gets, per Character,
  an "Alerts when closed" row, off by default, with one line saying what it
  stores. "Turn on" calls `startLogin` (`src/auth/session.ts`) with only the
  notifications scope and an Alerts intent, in the same way the corp-scope
  grant already runs its own scope request, and returns to the page through
  `loginReturnTo`. EVE's SSO page lets the user pick which Character to
  authorize and the app cannot preselect it, so the callback compares the
  token's Character with the row that was clicked: on a match the refresh
  token goes to the custody callable and is **never written to the device** or
  allowed to replace that Character's device session; on a mismatch nothing is
  stored and the user is told which Character they authorized. A Character
  whose grant is revoked or rejected shows "Needs re-authorizing" on its row.
  A "Turn on for all" action steps through the Characters one at a time.
- **The first-run explainer offers it as a second step, not a bundle.**
  `NotificationPermissionPrompt` stays the one-time OS-permission explainer
  (20260901 round 20): the Alerts Grant is never requested inside it, because
  it sends the user off to EVE's login and must not interrupt the permission
  answer. Once the user has answered Enable and permission is granted, the same
  banner slot offers "Also get alerts when the app is closed?" for the
  Character they just signed in as, whose EVE session is still warm, with
  "Turn on" and "Not now". "Not now" is remembered per device and Settings →
  Notifications owns the second chance. It is skipped where the permission
  step is skipped (iOS not installed, permission denied or unsupported), and
  Characters added later are offered through Settings only. Existing users who
  already dismissed the explainer see nothing new; their only entry point is
  Settings.
- **Custody.** The refresh token is stored encrypted (AES-256-GCM, key in a
  Firebase secret) in a function-only collection, one doc per Character. Every
  refresh writes the rotated token back in the same transaction that reads it.
  No access token is persisted. Nothing is ever logged or sent to a client.
- **Poller.** `pollEveNotifications`, `onSchedule('every 15 minutes')`, in
  `functions/`. Per grant: refresh, `GET /characters/{id}/notifications/` with
  the stored `ETag`, honour `X-Ratelimit-*`/`Retry-After` and the error budget,
  and work through grants in bounded-concurrency batches. It stores, per
  Character, a high-water `notification_id`, the grant's `enabledAt` and the
  set of types it has seen.
- **Which notifications are sent.** A notification is pushed to a device only
  if all hold: its id is above the high-water mark; its timestamp is after
  `enabledAt` (enabling alerts never replays history); and the device has that
  type enabled for the **browser** channel for that Character. The device's
  choices are the existing per-type state, including the types that are
  browser-on by default today and the rule that everything else is browser-off.
- **Preferences are per device, like Projections (20260928).** Each device's
  `registerDevice` upload gains, per Character it holds, the list of EVE types
  it has enabled for the browser channel. The registration doc stores that list;
  the poller fans a notification out to each registered device whose list
  includes the type. A device's upload replaces only its own list.
- **First-seen types.** The server records every type it sees for a Character.
  `registerDevice`'s response returns that set, and the client merges it into
  the types it offers toggles for. A type that has never been seen cannot have
  been enabled, so its first occurrence is not pushed; the toggle appears the
  next time the app opens. This is the existing "types are discovered from the
  feed" rule (round 34) with the server as another source of discovery.
- **Payload and rendering.** The server sends the raw notification — id, type,
  timestamp, the (size-capped) `text` — and no rendered copy; it has no SDE or
  i18n catalog (ADR 0010 still holds for that). The service worker renders it
  with the existing `eveNotificationText` path, falling back to the generic
  body when names do not resolve inside the resolution budget. The feed row is
  keyed by the same Occurrence Key the Foreground Poller derives for the
  notification, so opening the app later does not duplicate it.
- **Batching.** If one poll yields more than a small threshold of pushable
  notifications for a device and Character, send one summary push ("N new EVE
  notifications for <Character>") with a collapse key instead of one push each.
  The Foreground Poller still creates the feed rows when the app opens.
- **Failure and revocation.** `invalid_grant`, or a 403 on the endpoint, marks
  the grant revoked and stops polling it; the next app open shows a re-authorize
  prompt. Removing a Character, logging out, or deleting data calls a callable
  that deletes the grant and revokes the token at SSO. A dead FCM token deletes
  the device registration, as today.
- **Disclosure.** Login, Settings, `public/privacy.html` and
  `public/delete-data.html` state that, for Characters with Alerts on, an
  encrypted notifications-only token is stored on our server, and how to remove
  it.
- **Deploy.** `functions/` deploys stay manual.

## Considered Options

- **Keep ADR 0010 as is (scheduled facts only).** Rejected by the maintainer:
  structure attacks and similar events are worth minutes, not hours.
- **Poll from Hobohost cron.** Rejected: its cron and outbound-HTTPS limits are
  unpublished, and it would put refresh tokens on a shared host with no stated
  security posture. Cloud Scheduler + Secret Manager is safer and costs cents.
- **Share the device's token with the server.** Not possible: SSO rotates
  refresh tokens, so whichever refreshes first silently invalidates the other.
- **A full-scope server token, or the server as sole token holder.** Rejected
  (as in ADR 0010): the narrow scope is what makes this acceptable, and a
  server outage must not lock anyone out of login.
- **A curated list of event types.** Rejected: the user's existing per-type
  toggles already express the choice and cover every type ESI emits, with no
  list to maintain.
- **Poll every 5 minutes.** Rejected: ESI caches the endpoint for about 10
  minutes, so the extra polls mostly return 304.
- **Other personal events (market orders, contracts, mail).** Deferred: they
  need further scopes on the server token. Add per event, with its own ADR
  note, only if wanted.

## Consequences

- ADR 0001 is reversed for exactly one scope, and only for Characters that opt
  in. ADR 0010's "the backend holds no EVE token" no longer holds; its
  Projection design for scheduled facts is unchanged.
- Delivery for these events is at best polling-latency late (≲25 minutes),
  and only for opted-in Characters. Corp-role-gated types arrive only for
  Characters that hold the role, with no special handling.
- A compromised backend can now read opted-in Characters' notification feeds.
  It still cannot read anything else, nor act as them.
- The user's SSO revocation, an expired grant or a deleted data request all
  end polling cleanly; none can leave a token orphaned, because every path
  deletes the grant.
- A new scheduled job, a new encryption-key secret, and the first server-side
  SSO refresh code in `functions/`.
- The ESI error-limit budget is per client id and shared across all users;
  the poller must back off on 420/429 and skip rather than retry.
- Pushes can duplicate the Foreground Poller's output unless the Occurrence
  Key matches exactly; a test pins the two derivations together.
- The feature needs a second SSO redirect/consent screen to be built and
  explained; its copy must not claim tokens never leave the device.
