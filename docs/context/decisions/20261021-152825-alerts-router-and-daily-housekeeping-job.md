# Scope decisions — Alerts router and daily housekeeping job

_Recorded 2026-10-21._

- **`registerDevice`, `saveAlertGrant` and `deleteAlertGrant` are served by one `alertsCall` router**, like the community and Corp Tax Book callables. `mintFirebaseToken` and `mutamarketEstimate` stay separate (the sign-in path and an unrelated feature). The router carries `ALERTS_TOKEN_KEY`, which only the grant actions use. The per-name exports stay deployed until no client calls them.
- **The three daily jobs run as one scheduled function, `dailyHousekeeping`**: the Notification Feed purge, the stale-account purge and the Community Request sweep. A task that throws does not stop the next one; the run then fails naming what failed. The function has the 540 s timeout and `ALERTS_TOKEN_KEY`. Rules out three separate daily functions. `purgeNotificationFeed`, `purgeStaleAccounts` and `sweepCommunityRequests` are no longer deployed, so the next deploy asks to delete them.
