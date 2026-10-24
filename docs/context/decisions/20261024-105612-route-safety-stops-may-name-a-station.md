# Scope decisions — Route Safety stops may name a station (issue #4964)

_Recorded 2026-10-24 · issue #4964._

- **A station stop is a label on a system stop.** The gate route, the optimizer and the saved route see the system only; the leg list and Stops list show the station name. No docking or undock time. Rules out routing to a station as its own graph node.
- **One stop per system.** A second stop in the same system is dropped, keeping the first station named there. The stop list is keyed by system, as before.
- **The `stops` link carries `system:station`.** Plain system ids and the legacy `to` open exactly as before. A tag the page cannot name (a structure this Character cannot see) falls back to the system's name; a name is never guessed.
- **One shared place search.** `src/features/places/placeSearch.ts` serves Industry (the ESI search, then its own "can host this activity" filter) and Route Safety and the Move plan (the NPC station snapshot plus structures this device already knows, ranked locally — no ESI search per keystroke). Structures that were never looked up are not offered in Route Safety.
- **The Move plan destination takes any station.** Stations from the pilot's own assets stay as quick picks.
