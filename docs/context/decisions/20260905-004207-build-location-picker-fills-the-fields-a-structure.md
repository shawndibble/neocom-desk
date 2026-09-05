# Scope decisions — build location picker fills the fields a structure knows

_Recorded 2026-09-05. Issue #499._

- **Security stops being a field. It follows the build system.** A solar
  system has exactly one security band, so a select beside the system could
  only ever disagree with it. Naming a system now settles both the cost index
  the fee is charged at and the band the rig multiplier reads; the band is
  stated under the field as text. A plan with no build system takes its hub's
  band, which is highsec for all five hubs.

  Facility does **not** follow from the system — a system holds many
  structures — so it stays a field. Nor does the rig: the band is only the
  _multiplier_ applied to a fitted rig (`materials.ts` computes rig percent x
  security multiplier), and ESI publishes no structure fitting, so which rig is
  in the slot is knowable only to the pilot. Trade hub and facility tax fill
  from nothing either.

- **Build system stays a visible field, the same width as its neighbours.** The
  corp picker is a shortcut for pilots whose structure their corp owns; it is
  never the only way in, and hiding the field behind a disclosure would have
  made the ordinary path the harder one.

- **Picking a structure is fill-once, not a stored link.** Choosing one writes
  facility, security and build system in a single edit, and then steps out of
  the way. Nothing records which structure it was. Every field on screen reads
  the plan's own values, so nothing can drift from them, and a later edit is
  just an edit rather than a conflict with a link. The alternative —
  `buildStructureId` on the record — buys a "from K2-18 R&D" label and pays for
  it with two more synced fields and a divergence state to render. The job fee
  PR that preceded this one was caused by exactly that class of mismatch.

- **The structure list is filtered by typeID, not by reported services.**
  `CorporationStructure.services` is optional and ESI omits it once a structure
  runs out of fuel — which is exactly when a pilot is still planning jobs for
  it. What a structure _is_ does not go dark. Engineering Complexes only
  (Raitaru 35825, Azbel 35826, Sotiyo 35827, all group 1404, verified against
  `/universe/types/{id}` on 2026-09-05); Citadels and Refineries cannot host a
  manufacturing job.

- **A structure whose solar system will not resolve is not offered.** Without
  the system there is no security band, and a guessed band picks a rig
  multiplier (1x, 1.9x or 2.1x) out of thin air. Half-filling the plan is worse
  than leaving the row out of a list the pilot can still bypass by typing.

- **The one scope it needs goes in the base grant, not an opt-in group.**
  `esi-search.search_structures.v1` is the only addition —
  `esi-universe.read_structures.v1`, which reads the structure the search
  found, is already asked for at sign-in because Assets resolves structure
  names with it. So the consent screen grows by one line, for a plain feature
  of a route every Character can open, and the reasoning that grouped `corp` —
  seven scopes that ~95% of users can never exercise — does not apply to one
  scope that any pilot with a Build Plan can.

- **`/industry` stays UNGATED, and the re-auth offer lives in the panel.**
  Adding a base scope makes every Character who signed in earlier "missing a
  base scope". Declaring `getCharacterSearch` in `routeScopes.ts` would lock
  the whole Industry route behind a `ReauthBanner` for all of them, over a
  route that otherwise works perfectly. The picker offers the re-auth itself,
  beside the one control the scope unlocks.

- **The typed Build system field stays, and is not behind the grant.** It is
  the whole feature for anyone who declines the scope, and the only way to name
  a system with no station in it at all.

- **`securityBand` bands the rounded status, not ESI's raw float.** Balle is
  `0.4608891` in ESI and a 0.5 highsec system in game. Banding the raw value
  called it lowsec. The game rounds to one decimal and enforces the rounded
  value, so the app does too.

  This changes two callers, and the second one is not industry: the picker's
  own rig multiplier (1x rather than 1.9x for a system in the 0.45-0.4999
  window), and `features/pi/customsRate.ts`, where the same window now takes
  the highsec POCO base rate. Both were wrong before and are right now, but a
  planetary money change riding inside an industry change is worth saying out
  loud. `securityStatusColor` interpolates the raw value and is untouched.
