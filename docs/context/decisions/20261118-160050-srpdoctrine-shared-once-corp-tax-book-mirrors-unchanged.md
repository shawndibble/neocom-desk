# Scope decisions — srpDoctrine shared once; Corp Tax Book mirrors unchanged (issue #6400)

_Recorded 2026-11-18 · issue #6400._

- **`srpDoctrine` now lives once in `functions/src`; `src/engine/srpDoctrine.ts` re-exports it.** Byte-compare test deleted. Continues the 20261118 mirrors decision.
- **`corpTaxBookEngine` / `corpTaxBookSyncEngine` stay mirrored.** They mirror individual symbols across many `src/engine/corpTaxBook/*` modules, not a whole module, so nothing qualifies for a re-export; the differing-type redesign stays its own ticket.
