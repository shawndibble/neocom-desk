# Scope decisions — Lawless list is published to R2 by a GitHub Actions job (issue #5068)

_Recorded 2026-10-25 · issue #5068._

- **The app reads the lawless list from R2 first, Firestore second.** A GitHub Actions job (`public-data-lawless-systems.yml`) publishes `lawless-systems/systems.json` every 15 min; the client fetches it with no Firebase session and falls back to `systemConditions/lawless` on a miss, error or stale copy. Supersedes the "comes from a Firebase function" read path of the 2026-10-07 decision; `syncLawlessSystems` stays deployed as the fallback until a cleanup ticket removes it.
