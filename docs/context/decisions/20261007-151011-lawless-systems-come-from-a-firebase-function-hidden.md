# Scope decisions — Lawless systems come from a Firebase function, hidden past 60 minutes (issue #2870)

_Recorded 2026-10-07 · issue #2870._

- **Lawless (insurgency) systems reach the app through a scheduled Firebase function, never a direct browser call.** CCP's `eveonline.com/api/warzone/insurgency` allows CORS only for its own origin. `syncLawlessSystems` fetches it every 10 minutes and stores the corruption-state-5 system ids in `systemConditions/lawless` (signed-in read, no client write).
- **The badge hides once the list is more than 60 minutes old.** Six missed runs. A stale list must not read as current, so past the limit, or with the list missing, malformed or unreadable, Route Safety and the courier route note show nothing and no error.
- **The tag is a condition, not a verdict.** "Lawless" with a hint that says it is a state right now, not a forecast.
