# Scope decisions — build location picker fills the fields a structure knows (issue #499)

_Recorded 2026-09-05 · issue #499._

- **A Build Plan's job runs somewhere, and that place settles three fields at
  once.** Facility, build system and security band are three ways of saying
  "this structure", and a pilot who has one in mind should not have to
  translate it into three controls. One search fills all three.

- **It is a name search, not a list of the corporation's structures.** The list
  ESI can give from `/corporations/{id}/structures` is the wrong one: it leaves
  out the alliance tower, the rented Raitaru and every NPC station.
  `GET /characters/{id}/search` is the only route that finds a structure by
  name, it covers stations in the same call, and it returns what this Character
  can actually dock at — CCP's ACL, not ours. A first cut used the corp list; it
  was replaced rather than kept beside the search, because two controls
  answering the same question is worse than either.

- **Security stops being a field. It follows the build system.** A solar system
  has exactly one security band, so a select beside the system could only ever
  disagree with it. Naming a system settles both the cost index the fee is
  charged at and the band the rig multiplier scales by; the band is stated
  under the field as text.

  The rig itself does **not** follow. The band is only the multiplier applied
  to a fitted rig (`materials.ts`: rig percent x security multiplier), and ESI
  publishes no structure fitting, so which rig is in the slot is knowable only
  to the pilot.

- **A derived field still has to be reconciled, not only derived on edit.**
  Removing the Security select left three ways for a stored band to be wrong
  with no control to fix it: a plan saved before the field went away, a plan
  whose hub changed while it names no build system, and a new plan inheriting
  its band from whichever plan was edited last. `computeBuildPlan` still feeds
  that band to the rig multiplier, so a wrong one is wrong ISK, silently.
  `useDerivedSecurityBand` reconciles on load instead — not a Dexie migration,
  because the band comes from ESI and a migration that must reach the network
  is one that fails offline. A failed lookup leaves the plan alone until next
  time.

- **Facility and build system fold behind an "Override" link, under a line
  stating what the plan is set to.** Nothing is hidden, only folded: the
  summary reads the plan's own values, so it can never disagree with the fields
  it stands in for, and the link is always present — including for a Character
  whose token predates the search scope, for whom those fields are the whole
  feature.

  This is a reversal within the same change: the fields were briefly unfolded
  while the only shortcut was a list of the corporation's own structures, which
  most plans could not use. A search that finds any station or structure the
  Character can dock at earns the fold.

- **Picking a place is fill-once, not a stored link.** Choosing one writes
  facility, security and build system in a single edit, then steps out of the
  way. Nothing records which place it was. The alternative —
  `buildStructureId` on the record — buys a "from K2-18 R&D" label and pays for
  it with two more synced fields and a divergence state to render. The job fee
  PR that preceded this one was caused by exactly that class of mismatch.

- **Results are filtered by typeID, not by reported services.** A structure's
  `services` list is optional and ESI omits it once the structure runs out of
  fuel — which is exactly when a pilot is still planning jobs for it. What a
  place _is_ does not go dark. NPC stations always qualify; among structures,
  Engineering Complexes only (Raitaru 35825, Azbel 35826, Sotiyo 35827, all
  group 1404, verified against `/universe/types/{id}` on 2026-09-05), because
  no Manufacturing Plant service module fits a Citadel or a Refinery.

  Whether a hit is an NPC station is carried on the place by whoever resolved
  it — the search knows which category ESI returned the id under — never
  inferred from its typeID. Inferring made one place's qualification depend on
  what else came back beside it.

- **One result cap across both categories, applied before any lookup.** Every
  id kept is a further ESI request. Capping per category and truncating after
  the sort meant up to thirty lookups for fifteen rows, and let a name matching
  forty NPC stations crowd out the structure the pilot was looking for. The two
  lists are interleaved, then cut once.

- **A place whose solar system will not resolve is not offered.** Without the
  system there is no security band, and a guessed band picks a rig multiplier
  (1x, 1.9x or 2.1x) out of thin air. Half-filling the plan is worse than
  leaving the row out of a list the pilot can bypass by typing.

- **A failed search says so.** A 403, a 500 and being offline used to render
  "Nothing found. Try more of the name.", which sends the pilot off retyping a
  name that was never the problem.

- **An NPC station's rig and tax are settled by the app, not asked of the
  pilot.** A station has no rig slots and a tax CCP fixes at 0.25%; the game
  offers neither, so neither is a control here. They had been rendered
  disabled, which says "you could set this" about something nobody can.

  The engine already had this right — `materialModifier` and
  `jobDurationSeconds` zero the rig bonus for any non-structure facility, and
  `jobFee` takes the 0.25% from `FACILITY_PRESETS.npcStation.defaultTaxPct`.
  What was missing was the _plan_: the Facility select cleared `rigLevel` and
  `facilityTaxPct` on the way to a station and the location search did not, so
  a rig set for some structure would silently return the next time one was
  picked. `buildLocationPatch` is now the one place that decides.

  The 0.25% is cleared rather than written onto the plan. The rate is CCP's;
  copying it into a record would freeze today's number into every plan saved.

- **Facility tax cannot be filled from anywhere.** All three candidates checked
  against the live spec on 2026-09-05: `/industry/facilities` is NPC stations
  only (2,321 entries, zero player structures, `tax` absent on every one);
  `/corporations/{id}/facilities` returns `facility_id`, `system_id` and
  `type_id` and nothing else; `/universe/structures/{id}` has no tax field.
  Players often put the rate in the structure name ("... 0.4% tax"); reading it
  from there was rejected, because a renamed or stale structure would then
  quietly feed a wrong number into the fee.

- **The one scope it needs goes in the base grant, not an opt-in group.**
  `esi-search.search_structures.v1` is the only addition —
  `esi-universe.read_structures.v1`, which reads the structure the search
  found, is already asked for at sign-in because Assets resolves structure
  names with it. So the consent screen grows by one line, for a plain feature
  of a route every Character can open, and the reasoning that grouped `corp` —
  seven scopes that ~95% of users can never exercise — does not apply to one
  scope any pilot with a Build Plan can.

- **`/industry` stays UNGATED, and the re-auth offer lives in the panel.**
  Adding a base scope makes every Character who signed in earlier "missing a
  base scope". Declaring `getCharacterSearch` in `routeScopes.ts` would lock
  the whole Industry route behind a `ReauthBanner` for all of them, over a
  route that otherwise works. The picker offers the re-auth itself, beside the
  one control the scope unlocks.

- **The typed Build system field stays, and is not behind the grant.** It is
  the whole feature for anyone who declines the scope, and the only way to name
  a system with no station in it at all.

- **`securityBand` bands the rounded status, not ESI's raw float.** Balle is
  `0.4608891` in ESI and a 0.5 highsec system in game. Banding the raw value
  called it lowsec. The game rounds to one decimal and enforces the rounded
  value, so the app does too.

  This changes two callers, and the second is not industry: the rig multiplier
  (1x rather than 1.9x for a system in the 0.45-0.4999 window), and
  `features/pi/customsRate.ts`, where the same window now takes the highsec
  POCO base rate. Both were wrong before and are right now, but a planetary
  money change riding inside an industry change is worth saying out loud.
  `securityStatusColor` interpolates the raw value and is untouched.

- **"Owned Material Source" moves to the head of the Materials panel.** It
  governs one number in one column of the table below it — the owned quantity
  "use detected" offers — and nothing else on the plan. In Location & market it
  read as a third statement about _where the job runs_, beside Facility and
  Trade hub, when it is really about which of the pilot's hangars the table may
  count. Label inline with the select from `sm` up, stacked below that.
