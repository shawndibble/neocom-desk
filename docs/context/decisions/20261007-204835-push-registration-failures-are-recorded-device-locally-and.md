# Scope decisions — Push registration failures are recorded device-locally and shown with Retry (issue #2844)

_Recorded 2026-10-07 · issue #2844._

- **A failed Web Push registration or Scheduled Push upload leaves a device-local record: a typed reason (`browser-refused`, `network`, `server-rejected`, `unknown`) and a time.** Never the error message, endpoint or token, and never synced. Settings > Notifications shows one warning row with a Retry button while the record exists and permission is granted. Event toggles stay usable: in-app alerts still work.
- **Any later successful registration or upload clears it; a no-op upload (`skipIfUnchanged`, no token) leaves it alone.** The 5-minute poll must not hide a standing failure. A rejected-for-every-character result counts as `server-rejected`.
- **Unregistration failures stay console-only.** The user is leaving push, so there is nothing to retry. Widening which events wake a closed app is a separate ticket.
