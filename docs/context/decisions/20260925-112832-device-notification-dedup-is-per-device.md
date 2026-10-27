# Scope decisions — Device notification dedup is per device

_Recorded 2026-09-25._

- **A Notification Feed row synced in from another device no longer stops this device's own OS notification.** Issue #360 suppressed the Foreground Poller's toast whenever a row for the Occurrence Key existed. Once the feed synced, a desktop tab that saw a Market Order Undercut first made the phone skip its toast — and an undercut has no Scheduled Push, so the phone never heard of it outside the Alerts page. The toast is now skipped only when this device already notified for it (a local, never-synced `notifiedHereAt`, stamped by the poller and by the Web Push handler), the row was dismissed on any device, or the row is more than 24 hours old (`feed.TOAST_STALE_AFTER_MS`). Feed sync still carries dismissals both ways. Rules out: one device's toast counting as delivered on another.
