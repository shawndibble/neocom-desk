# Scope decisions — ansiblex jump bridges in route safety (issue #2478)

_Recorded 2026-10-03 · issue #2478._

- **Gates are found two ways: a character's structure search, and a pasted
  list.** Public ESI lists no Ansiblex (esi-issues #1084). The search is
  `GET /characters/{id}/search?categories=structure&search=" » "` under
  `esi-search.search_structures.v1`, each id then read through
  `GET /universe/structures/{id}` under `esi-universe.read_structures.v1`
  (both in the base grant). The term is " » " with a space either side, not a
  bare "»": ESI's spec sets a three-character minimum on `search`, and the
  search is a substring match, so the spaced form still finds every
  "SYS1 » SYS2 - name". A structure whose `type_id` is present and not the
  Ansiblex (35841), whose name does not read as a gate, or whose name places
  it in a system other than ESI's `solar_system_id`, is skipped. A structure
  no character can read is left out (the existing structure reader may fall
  back to another character for the name). The search finds only what that
  character can see, so each character runs its own (or Find with every
  character runs them in turn) and the list says who found each gate, by the
  search that listed it; a character's new search replaces only its own
  finds. A character whose grant lacks the search is never asked. The
  pasted list (one "SYS1 » SYS2" or full in-game name per line) is the
  fallback for gates no character can search for; unknown systems, lines that
  are not a gate, and systems outside known-space nullsec are listed back.
- **The list and its switch stay on this device.** Structure access is private
  alliance information: the list is a Dexie table (`ansiblexGates`) that is
  never synced, backed up to Firebase, or logged. Use jump bridges is a
  device-local default (overridable in the link as `jb`), not a synced one —
  on another device it would switch on an empty list.
- **Route Safety only, like the hole settings.** No other page's jump count
  changes with a private bridge list. Bridges join the search per request as
  `extraConnections`, never the stargate graph (`loadJumpGraph()` stays
  stargate-only, so Set waypoints still cuts at a bridge and names it one).
  Each bridge is one jump, and its landing system is charged like any other:
  unlike a hole, a bridge never makes a system free.
- **Via Ansiblex is a Way to fly only while Use jump bridges is on.** With it
  off, no leg lists Via Ansiblex and no setup prompt shows — the same as the
  hub ways while Hole jumps are off — so a pilot who never flies bridges sees
  nothing new on every leg. With it on and no gate known, the Via Ansiblex
  box offers Find with a character or paste a list. A leg pinned `ansiblex`
  while the switch is off (or with no gate known) says so and flies the
  planner's pick.
