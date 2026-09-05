# Scope decisions (round 34) — EVE's own notification endpoint

_Recorded 2026-09-03._

- **Per-type default is feed-on/browser-off**, the opposite of every other
  event's absence-means-on-both-channels default (round 20). These are far
  more numerous and mostly informational, so a type has to be opted _up_ to
  an OS interruption rather than opted down from one; the default has to be
  expressed explicitly per type since it differs from the surrounding
  idiom.
- **Types are discovered from the feed, not enumerated up front.** Settings
  offers a per-type toggle only for a `type` this Character's Notification
  Feed has already recorded at least once — there is no closed catalog to
  list ahead of time, and a type has to have reached the feed before there
  is anything to toggle.
- **Rendering is one generic body for every type in v1**, not a per-type copy
  dictionary. AC2 only requires an unrecognised type to render without
  dropping or throwing; hand-written bodies for the handful of high-traffic
  types (bill amount, war target, structure name) are a follow-up, not
  required to ship the domain.
- **The Overview fallback route is a deliberate choice for this event**, not
  an inherited default: most of ~100 types have no corresponding page in the
  app, so `eveNotification` names `/overview` explicitly in
  `NOTIFICATION_ROUTES` rather than leaving a gap the fallback happens to
  catch.
