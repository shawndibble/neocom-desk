# 0028 — The Alerts Grant may also carry the location scope, so nearby alerts reach a closed app

## Status

Accepted (2026-10-25). Amends ADR 0020.

## Context

Two Notification Events are about where a Character is: `incursionNearby`
(an Incursion within N jumps, issue #3542) and `skyhookRaidableNearby` (a
skyhook raid window within N jumps, issue #4784). Both lists are public, but
"nearby" needs the Character's Current System, which only the open app's
Foreground Poller reads. So both fired only while the app was open, and a pilot
who closes the app between sessions never heard about the Incursion that spawned
next door (issue #5122).

ADR 0020 already gives the server one narrow token per opted-in Character, and
a poller that refreshes it every 15 minutes. It deliberately held one scope.
This ADR decides whether that token may hold a second.

## Decision

The Alerts Grant may carry `esi-location.read_location.v1` beside
`esi-characters.read_notifications.v1`, and nothing else. The poller reads the
location with the token it already refreshed and pushes nearby Incursions and
raid windows.

- **Scope check.** `saveAlertGrant` accepts a token whose scopes are the
  notifications scope alone or with the location scope; anything else is still
  refused. The grant doc records the token's `scopes`. A grant saved before this
  ADR has no `scopes` field and means notifications only.
- **Existing grants keep working.** The poller reads the location only for a
  grant whose `scopes` include it; a notifications-only grant is polled exactly
  as before. Settings marks such a row "On, without nearby alerts" with an "Add
  nearby" action, which re-authorizes the Character with both scopes (the save
  keeps the grant's `enabledAt`, high-water mark and seen types).
- **Rollout order.** The web deploys before the functions. A client asks EVE for
  the location scope only after the server has said it takes it:
  `registerDevice` now answers `nearbyGrants` (the Characters whose grant carries
  the location), and an older function, which would refuse the two-scope token,
  never sends that field. New `registerDevice` input fields are optional, and an
  older function ignores them.
- **Per-device choices.** Each `registerDevice` upload carries, per Character,
  the server-pushed event ids the device enabled for the browser channel
  (`serverEvents`, ADR 0027's list; the two nearby ids join
  `SERVER_PUSHED_EVENT_IDS`) and its N per nearby event (`incursionNearbyJumps`,
  `skyhookRaidableNearbyJumps` in ADR 0027's `serverInputs`), and, once, the
  device's Travel Settings (`routeRules`). The registration doc stores them, as
  it stores `eveTypes`. A push carries the raw fire as JSON (`fire`), as ADR
  0027's pushes do, and the worker renders it with the poller's copy.
- **Same rules as the open app.** Entries are built, diffed, ranked and keyed as
  the Foreground Poller does (mirrors of the engine files, pinned by tests), over
  a bundled copy of the stargate graph; see decision
  `20261025-074204-server-counts-nearby-jumps-over-stargates-from-the` for what
  the server leaves out (holes, bridges, a hand-picked system) and decision
  `20261025-074204-nearby-alerts-ride-the-alerts-grant-and-its` for the poll.
- **Payload.** The raw fire plus a generic English title and body. The service
  worker words it with the app's own copy and names from one public
  `/universe/names` call, and writes the feed row under the app's Occurrence Key.

## Considered Options

- **A second, location-only grant.** Rejected: a third consent screen per
  Character, a second rotating refresh token to keep in custody, and a second
  refresh per poll, for a token no narrower in effect.
- **Push the location from the device.** Not possible: a closed app runs
  nothing, which is the whole point.
- **A sibling scheduled job.** Rejected: it would refresh the same rotating
  token on its own clock and race the poller for it, and cost another Cloud
  Scheduler job.
- **Ask ESI's `/route/` per pair.** Rejected: one request per Incursion or
  skyhook per Character per poll against the shared error budget, and ESI's
  route treats an Avoided System as a wall where the app weighs it as a cost.

## Consequences

- **Custody.** A leaked or compromised Alerts token can now also read where an
  opted-in Character is (its solar system, and station or structure). That is
  more sensitive than a notification feed: it is a live position. It still
  cannot read assets, wallet, mail or skills, nor act as the Character. Only
  Characters whose owner pressed Turn on, or Add nearby, after this ADR carry
  it. The server stores no location history: each device's `nearbyState`
  keeps, per Character located in the last run, the system it was counted
  from, which the next run replaces. A Character not located in a run loses its
  entry; deleting the grant drops it from every device; the registration doc
  holds the state and goes with it.
- **Disclosure.** Settings, the alerts offer, the FAQ, `public/privacy.html` and
  `public/delete-data.html` now say the grant reads notifications and, for
  nearby alerts, location. Copy no longer calls it "notifications-only" where
  the location may be included.
- **Cost.** Per location-capable grant, one more ESI call per 15 minutes (the
  location, cached by ESI for seconds); per run, two public calls (Incursions,
  raidable skyhooks) only when some device wants them; one `deviceRegistrations`
  query and one doc update per device that wants nearby alerts. No new
  scheduled job and no new secret. The stargate copy adds ~400 KB to the
  functions bundle.
- **Latency.** At best one poll late: up to about 15 minutes after the
  Character arrives or the Incursion spawns, plus ESI's own cache on the lists.
  The open app's 5-minute poll stays the fast path.
- **Error budget.** The location call and the two public lists follow ADR 0020's
  etiquette: `X-Compatibility-Date`, a descriptive `X-User-Agent` with no email
  address, stop on 420/429 or a low `X-ESI-Error-Limit-Remain`, skip rather than
  retry. A 403 on the location drops that scope from the grant's stored
  `scopes` without revoking the grant, so it is not retried every run.
