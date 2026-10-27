# Scope decisions — Route Safety reads zKillboard per system and names stargates from ESI (issue #2329)

_Recorded 2026-09-30 · issue #2329._

- **zKillboard is read one system per request, at concurrency 3, cached five
  minutes per system.** Unlike ESI's universe-wide kill feed (decision
  `20260912-165245`), zKillboard has no all-systems call, so a route costs one
  request per system. The low concurrency and the cache are what keep that
  polite. A failure or a 429 marks only that row unavailable, is never cached,
  and never reads as zero kills. It is a plain browser fetch with no custom
  headers, as decision `20260924-195833` set for Fittings.

- **Stargates are named from `GET /universe/stargates/{id}`, not
  `/universe/names`.** The ticket planned one batched `/universe/names` call,
  but ESI rejects the whole batch when any id is a stargate or celestial
  ("Ensure all IDs are valid before resolving"; probed 2026-09-30). The
  stargate endpoint also returns `destination.system_id`, so "a gate on your
  path" is an id match against the previous and next route systems rather than
  a name match. Stargates never change, so each is read once per session.
  `build-sde` was not extended to ship stargate ids: that would regenerate
  every data file for a lookup that only ever touches the few gates kills
  actually happen at. NPC stations come from the local snapshot. Planets,
  moons, belts and player structures stay unnamed, pooled as "elsewhere in the
  system".

- **The bubble tag says what the killmail shows: "Interdictor or HIC on the
  mail".** A killmail lists attacker hulls, not whether a bubble was up, so
  "bubbles used" would state more than the data does (decision
  `20260912-172628`). The tag applies in nullsec only, where bubbles can be
  launched. The smartbomb tag reads the attacker's weapon type, which does show
  that a smartbomb dealt damage.
