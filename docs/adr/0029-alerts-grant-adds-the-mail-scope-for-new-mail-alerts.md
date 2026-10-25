# 0029 — The Alerts Grant may also carry the mail scope, so new mail reaches a closed app

## Status

Accepted (2026-10-25). Amends ADR 0028 (which amended ADR 0020).

## Context

`newMail` fires only from the open app's Foreground Poller, which diffs the
Character's mail headers (`diffNewMail`). A pilot who closes the app hears
about no mail until they reopen it (issue #5143). ADR 0028 already lets the
server-held Alerts token carry the location beside notifications. This ADR
decides whether it may carry mail, the most sensitive scope yet.

## Decision

The Alerts Grant may carry `esi-mail.read_mail.v1` beside
`esi-characters.read_notifications.v1` (and optionally the location), and
nothing else. The poller reads the mail headers with the token it already
refreshed and pushes new mail.

- **Headers only.** The server calls `GET /characters/{id}/mail/` and nothing
  else of the mail API: no body, no mailing lists, no labels, no sending. It
  reads each header's id, sender id, subject and time.
- **Explicit, per Character.** A fresh Turn on never asks for mail. The
  Character's row offers "Add mail", which re-authorizes it with every scope it
  already had plus mail. Scopes are checked on save (`saveAlertGrant` accepts the
  three, nothing else); the grant doc records them.
- **Existing grants keep working** for exactly what they have and read as
  lacking mail until re-authorized.
- **Rollout order.** The web deploys before the functions. The client asks for
  the mail scope only after `registerDevice` answers `mailGrants` (an older
  function omits it, and would refuse the three-scope token).
- **Same rules as the open app.** `mailPush.ts` mirrors `diffNewMail` (a mail id
  above the high-water mark, not sent by the Character itself; the first read
  seeds the mark silently) and the Occurrence Key, pinned by a root parity test;
  enabling never replays the inbox. Per device and Character, the choice is the
  existing `serverEvents` list (`newMail` joins `SERVER_PUSHED_EVENT_IDS`); Quiet
  Time applies; ESI etiquette is ADR 0020's (compatibility date, a descriptive
  `X-User-Agent` with no email address, ETag/304, stop on 420/429 or a low error
  budget, skip rather than retry). It shares the 15-minute run and the single
  refreshed token.
- **What is stored server-side.** On the grant doc: `mailHighWaterId` (a mail
  id), `mailEtag`, and `mailPushed` (`deviceId|Occurrence Key` entries, non-empty
  only while a partial send keeps the mark back). Never a sender, a subject or
  any mail content. No device wanting `newMail` clears the mark and the server
  stops reading.
- **What travels.** The push carries the raw fire, including the sender id and
  the subject (size-capped), through FCM, so the pop-up can say who wrote and
  what about, with the sender's name resolved on the device through public
  `/universe/names`. This is the only place a subject leaves the player's own
  data. The feed row the worker files carries no sender or subject (the
  Notification Feed syncs to Firestore).
- **Revocation.** Turn off, Remove Character, Log out and Delete all data delete
  the token and revoke it at SSO, taking the mail state with the grant. A 403 on
  the mail call drops the mail scope from the grant (state cleared) without
  revoking it, as ADR 0028 does for location, so a dead scope is not retried
  every run; the Character then reads as lacking mail and Add mail is offered
  again.

## Considered Options

- **Fetch bodies on the server to push the message.** Rejected: bodies are
  private conversation text, and nothing in the notification needs them.
- **A generic push ("you have new mail") with no sender or subject.** Rejected
  by the owner's request as of little use; the cost is that the subject transits
  Google's push service and can show on a lock screen, disclosed below.
- **Persist the sender or subject to render rows later.** Rejected: nothing
  needs them server-side, and the synced feed would have carried them.
- **A separate mail-only grant.** Rejected for ADR 0028's reasons: a second
  rotating refresh token to keep in custody and refresh.

## Consequences

- **Custody.** A leaked Alerts token on a Character with mail can read that
  Character's mail headers (and, as ever, nothing it was not granted: no bodies
  are fetched by us, but the scope itself also permits ESI's body route). That
  is the most sensitive token we hold, so Add mail is opt-in per Character and
  never bundled.
- **Disclosure.** Settings (the row states what the grant reads, and the hint
  says subjects pass through Google's push service), the first-run offer, the
  FAQ, `public/privacy.html` and `public/delete-data.html` say the grant may read
  mail headers and that sender and subject travel in the push and appear in the
  pop-up.
- **Cost.** Per mail-capable grant with a wanting device, one more ESI call per
  15 minutes (304 when unchanged); no new scheduled job, secret or export.
- **Latency.** Up to about 15 minutes. The open app's 5-minute poll stays the
  fast path.
- **A burst** pushes the newest five mails per device per run; the rest reach the
  Alerts list when the app opens.
