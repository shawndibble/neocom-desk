# Scope decisions — Assumed TE seeds a plan, not its sub-jobs (issue #634)

_Recorded 2026-09-09 · issue #634._

- **Assumed TE is a second preference beside assumed ME, not a second field on
  one control.** They answer different questions — material cost and job time —
  and a pilot may well want one assumed and the other left at 0. The ranges
  differ too (`engine/industry/time.ts` throws outside TE 0..20, where ME is
  0..10), so a single number could not have served both. Each syncs under its
  own key (`sync.industryAssumedTe`, `sync.industryAssumedMe`) so changing one
  on a laptop cannot roll back the other set on a phone.

- **It seeds a Build Plan's own TE only. Sub-jobs below it are still timed at
  TE0.** This is the asymmetry to leave alone, not a half-finished change: assumed
  ME reaches sub-jobs through `recipes.ts`'s `assumedMeForUnowned` because
  material cost compounds down the tree and is the number a plan (and a Build
  Group rollup) leads with, while `engine/industry/makeOrBuy.ts` deliberately
  hardcodes `te: 0` for a sub-job, per the sub-builds decision recorded on
  2026-09-04. Extending assumed TE downward would change the make-or-buy
  verdict itself, which is a different decision from "what does a blueprint I
  don't own start at" and wants its own ticket.

- **Default 0, and a damaged stored row falls back to 0 rather than being
  clamped.** Same as assumed ME: an existing plan's numbers must not move until
  the pilot asks, and an out-of-range value would reach the engine's own range
  check and throw, so the store refuses it instead of inventing a nearby value
  the pilot never chose. Clamping lives only in the Settings control, where the
  pilot is actually choosing.

- **No `legacyKey`.** The preference is new and never had a device-local life
  under an unprefixed name, unlike its ME twin — so there is nothing to adopt,
  and a stray `industryAssumedTe` row belongs to somebody else.

- **Not addressed here: setting ME/TE across every member of an existing Build
  Group at once.** That is issue #632. This preference only decides what a
  newly created plan starts at, on both creation paths — the blueprint picker
  and Fit Import.
