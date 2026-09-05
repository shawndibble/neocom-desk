# Scope decisions — build location picker fills the fields a structure knows

_Recorded 2026-09-05. Issue #499._

- **Facility, security and build system sit behind one summary line and an
  "Override these" link.** They are three ways of saying "this structure", and
  a pilot who has a structure in mind should not have to translate it into
  three dropdowns. Rig level, trade hub and facility tax stay in the open —
  nothing fills those, so hiding them would only add a click. The disclosure is
  component state, not a stored field: it is presentation, so it can never
  disagree with the plan.

- **Picking a structure is fill-once, not a stored link.** Choosing one writes
  facility, security and build system in a single edit, and then steps out of
  the way. Nothing records which structure it was. The summary line always
  reads the plan's own values, so it cannot drift from them, and a later edit
  to any field is just an edit rather than a conflict with a link. The
  alternative — `buildStructureId` on the record — buys a "from K2-18 R&D"
  label and pays for it with two more synced fields and a divergence state to
  render. The job fee PR that preceded this one was caused by exactly that
  class of mismatch.

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

- **The corp read stays opt-in.** `/corporations/{id}/structures` is role-gated
  and rate-limited, and `useCorpSnapshot` exists so a corp call fires only when
  the user asks for it. The picker is a button first and a select second, and
  for a Character with no corp capability the button does not render at all —
  the hide rule, same as every other corp surface.

- **Structures outside the corp stay out of scope.** They need
  `esi-search.search_structures.v1` and `esi-universe.read_structures.v1`, and
  whether those belong in the base grant or a scope group is a product
  decision, not a mechanical one. The typed Build system field remains the
  fallback for them.

- **`securityBand` bands the rounded status, not ESI's raw float.** Balle is
  `0.4608891` in ESI and a 0.5 highsec system in game. Banding the raw value
  called it lowsec, which is a wrong CONCORD answer for the Assets badge and
  the wrong rig multiplier for an industry job. The game rounds to one decimal
  and enforces the rounded value, so the app does too.
