# Scope decisions — Group callables behind per-domain routers

_Recorded 2026-10-21._

- **The community and Corp Tax Book callables are served by two routers, `communityCall` and `corpTaxBookCall`.** A full `firebase deploy --only functions` updated ~80 functions at once and hit Cloud Functions' per-minute mutation quota (429), leaving a mix of old and new code live. A router takes `{ action, data }`, where `action` is the old callable's name, and runs the same handler. Rules out one deployed function per callable for these two groups; the scheduled jobs stay separate (different memory, timeout and secrets).
- **The old per-name exports stay deployed until no client calls them.** Dev and prod share one Firebase project, so removing them in the same deploy would break any open tab on the old bundle. They are deleted in a later change, which also takes them out of `index.ts`.
- **A router carries the union of its group's secrets and the longest timeout.** The Corp Tax Book router has `FEEDER_VIEW_SECRETS` and `timeoutSeconds: 120`; per-callable `maxInstances` no longer applies.
- **Auth, device, alerts and `mutamarketEstimate` stay as their own callables.** They are few, and each has its own secret or caller rules.
