# Scope decisions — Privacy policy audit: sync is automatic, Share Links and analytics disclosed, GA page_location uses the route pattern

_Recorded 2026-10-15._

- **The policy states what the code does, not what was intended.** Cross-device sync is automatic for every logged-in Character in a build with Firebase config (`app/syncStatus.ts`, `App.tsx`); there is no in-app switch, so the policy says so instead of "if you turn on sync". Share Links (`shares` + `survey*` collections, 7-day TTL, public by id) and the Alerts-when-closed push of notification text through FCM are now disclosed; both were missing.
- **Google Analytics `page_location` is the route pattern, not the raw pathname.** The raw pathname carried a Share Link id (`/s/:shareId`, the only secret keeping a share private) and plan/corporation ids to Google, which contradicted the 20260910 GA4 decision. `pageLocationFor` now takes the `pagePathFor` result.
- **Policy wording says the app "is set not to attach" the IP to Sentry reports**, because `userInfo: false` is an SDK setting; whether Sentry's own project setting also discards the connection IP is not verifiable from the repo.
- **Left as owner decisions, not guessed:** Firebase/Functions/Sentry data region, children/age statement, legal bases and user-rights wording, an in-app sync/analytics opt-out, and any in-app way to delete a Share Link.
