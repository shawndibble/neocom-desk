# Scope decisions — The app opens on Overview, not the character list

_Recorded 2026-09-07._

- **`/` sends a returning user to `/overview`.** Opening the app with a
  Character already active landed on `/characters`, so every visit began with
  a step: pick the pilot you already picked last time. Overview is what the
  rail leads with (round 23) and what someone reopening the app came back to
  read. `/characters` keeps its job — switching and adding — it just stops
  being the front door.
- **The character list stays the landing for "characters, but none active".**
  A Character can exist in Dexie with no `activeCharacterId` setting (the
  active one was removed with others left, or the setting never got written),
  and picking one is exactly what that page is for. So the index is a
  three-way gate, not a two-way one: active Character -> `/overview`,
  characters without one -> `/characters`, none -> `/login`.
- **The index waits on the active-character store, not just the count.**
  `hydrate()` reads the setting from Dexie asynchronously, so deciding on the
  count alone would redirect to `/characters` on the first frame every time
  and Overview's own `activeCharacterId === null` guard would bounce it right
  back — a visible flash through the very page this change removes from the
  path. `Root` holds the `BootScreen` until both the count and hydration
  resolve.
- **`/callback` is unchanged: it still lands on `/characters`.** Finishing an
  SSO login means a Character was just added, and the list is where you see
  that it landed and pick between it and the others. This decision is about
  reopening the app, not about signing in.
