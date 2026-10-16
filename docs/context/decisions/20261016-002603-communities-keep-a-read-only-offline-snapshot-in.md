# Scope decisions — Communities keep a read-only offline snapshot in settings

_Recorded 2026-10-16._

- **<Decision>.** <Why, and what it rules out.>

- The Communities page keeps the last list it read while online, each Community's last roster, and its last Member libraries, in the existing `settings` table under `communitySnapshot:{characterId}:{kind}[:{communityId}]` (`features/communities/communityCache.ts`). No new Dexie table, so no schema bump. Another Character never sees them, `removeCharacter` deletes them with the Character, and "Delete all data" clears them with the rest of IndexedDB.
- When a live read fails, the saved copy is shown read-only under "Showing cached data" with a Retry button; the page also retries when the connection returns. Writes (create, Manage, My sharing, New request, Leave, a Member's actions) show "Needs a connection" while offline. Requests, Pledges, Fittings and Skill plan content are not snapshotted: they keep their own load-failed states.
