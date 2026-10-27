# Scope decisions — Analytics switch is a device-local setting (issue #3847)

_Recorded 2026-10-15 · issue #3847._

- **The analytics switch is device-local (`analyticsEnabled`), default on, never synced.** Consent to tracking is per browser, so it must not follow the pilot to another device, and "Reset saved view preferences" must not clear it (it has its own Settings control).
- **Off means Firebase Analytics is never loaded.** `trackPageView` hydrates the store and returns before importing `firebase/analytics`; the value is read at call time, so toggling applies from the next page view.
