# Scope decisions — Job-consumed owned stock: unknown ME and facility bonuses under-subtract (issue #6386)

_Recorded 2026-11-18 · issue #6386._

- **A job's ME comes from the Character's blueprint of the job's `blueprint_id`, not the job.** ESI's job record has no ME. A blueprint that cannot be found (a consumed copy, no blueprints scope, a cache that predates `blueprint_id`) counts as ME 10, the least the job could have consumed, so the failure is an unchanged offer.
- **A job's materials are priced at a neutral facility (no structure or rig bonus).** The job record carries no bonuses; the true figure is at most a few percent lower, so this can over-subtract slightly at a bonused structure. Accepted over subtracting nothing.
- **Hangar and container detail of the placement at the job's facility is not trimmed.** Only the placement's `quantity` falls, so a scope narrowed to hangar divisions or containers sees no reduction (under-subtract).
