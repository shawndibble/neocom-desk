# Scope decisions — A Scheduled Push is a prediction, and the device retracts the ones it disproves

_Recorded 2026-09-07._

- **A projected push whose claim an ordinary in-game action can falsify words
  itself as a prediction, not an observation — title included.** ADR 0010's
  Consequences already named this ("the backend cannot verify a Projection
  before firing it") and `projectionWording` already encoded it, but only for
  `structureFuelLow`. The two planetary events had the same exposure and a
  worse case for it: stopping an extractor program and installing a new one
  _is_ the reset run, the very action these alerts exist to prompt, so a pilot
  who acts on the warning with the app closed is the one told their programs
  expired. Both now hedge. This rules out treating hedged wording as a
  per-event judgement call — the test is whether a routine in-game action
  falsifies the prediction before it lands, and three events pass it.

- **The hedge covers the title, not only the body.** A push is often read as
  one line on a lock screen, where the title is the whole claim; "Extraction
  done" over a colony still running is the exact sentence the defect was
  reported for. `structureFuelLow` keeps its assertive title deliberately —
  "Structure fuel low" is a standing condition a refuel resolves, so it reads
  as stale rather than false. This rules out the reading that the earlier,
  body-only hedge was the pattern to copy.

- **The live path stays assertive, and the two paths are allowed to diverge
  for these events only.** The Foreground Poller has watched the colony go
  idle; softening its copy would make it lie in the other direction. The
  hedged text is written inline in `engine/projection.ts` rather than through
  `SHARED_NOTIFICATION_WORDING`, on `structureFuelLowText`'s precedent, and
  `src/i18n/index.test.ts` pins the divergence where the "both paths agree"
  invariant lives. This rules out a silent widening: adding a seventh shared
  event that quietly words the push differently now fails a test.

- **The device retracts feed rows for occurrences it can prove never
  happened.** A restarted extractor takes a new `expiry_time`, hence a new
  Occurrence Key, so the row a stale push wrote is never revisited by ordinary
  polling — it would sit in the Notification Feed unchallenged forever.
  `engine/notificationDiffs.supersededExtractorOccurrences` reads the
  replacement program's `install_time`: a program installed _before_ the one
  it replaced was due to expire is proof that expiry never came. This rules
  out leaving hedged wording as the whole answer; the alert is honest, but the
  row is still about something that did not happen.

- **Retraction demands proof, and answers empty without it.** A missing
  `install_time` (spec-optional), a vanished colony or pin, an unchanged
  expiry, and a program left to run out before being restarted all retract
  nothing. The asymmetry is deliberate: failing to retract leaves one stale
  row, while retracting wrongly erases a true "extraction done" from the
  pilot's own history. This rules out inferring a restart from a changed
  expiry alone, which is the cheaper signal and the wrong one.

- **Retraction dismisses; it never deletes.** The feed syncs (issue #361), and
  `feed.dismissFeedEntry` records that this collection carries no tombstones —
  a deleted row simply returns on the next pull from another device, whereas
  `mergeFeedRecord` carries a dismissal across in both directions. This rules
  out delete-on-retract, and it also rules out a new `retractedAt` column,
  which would need its own merge rule and its own rendering to say something
  the dismissal already says: this no longer needs your attention.

- **Verification of a push at delivery is rejected, not deferred lightly.**
  The service worker could in principle re-check ESI when a push arrives and
  correct the copy. It cannot in practice: an EVE access token lives about 20
  minutes and is only refreshed while the app is open and visible
  (`ForegroundNotificationPoller` gates on `document.hidden`), so at push time
  — by definition, app closed — there is no usable token. Reaching one would
  mean refreshing from the service worker, and EVE SSO rotates refresh tokens,
  so a refresh racing the page's own would burn it and log the character out
  (ADR 0001's storage rule is what makes the token device-local in the first
  place). Paying that risk on the app's auth path, for a fan-out of ESI calls
  inside a push handler where a slow path costs the subscription on WebKit
  (`pushHandler.ts`: no silent path), buys corrected copy that hedging makes
  honest for free. This rules out SW-side verification for as long as those
  constraints hold; it does not rule out a backend that could verify, which
  ADR 0010 rejected on separate grounds.
