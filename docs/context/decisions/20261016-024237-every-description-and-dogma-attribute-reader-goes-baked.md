# Scope decisions — Every description and dogma-attribute reader goes baked first (issue #3884)

_Recorded 2026-10-16 · issue #3884._

Extends `20261015-203512-item-detail-reads-baked-type-info-from-sharded.md`.

- **Every reader of only a type's description, dogma attributes or volume goes through one loader, `src/features/skills/typeDetail.ts` (`loadTypeDetail`), which reads the baked typeInfo shard first and cached ESI second.** That covers Item Detail, a Fitting's required skills, Compare Attributes, the order row's required skills, clone implant details and every implant-bonus sum (Skills, Clones' training verdict, the What-If jump-clone presets, `loadImplantBonuses`). Offline, these now work for any published type, not only for types fetched online before. One loader, not a baked check per caller, so a new reader gets the offline path by using it.
  - **Baked-first is not pushed into `loadUniverseType`.** A baked record has no `name`, `dogma_effects`, `packaged_volume` or `group_id`. Returning it from the general ESI loader would hand those callers a silently short type, and a hardpoint read would cache "takes no hardpoint" for every turret. `loadTypeDetail` returns the narrow `Pick<UniverseType, 'description' | 'volume' | 'dogma_attributes'>`, so typecheck stops a caller that reads a field the shards lack.
  - **The ESI fallback keeps each caller's retry.** Callers that resolve one type at a time (required skills, implants) pass `retry: true` and get `loadUniverseType`'s one paced retry; Item Detail, Compare and the order row keep the single read.

- **Readers of fields the shards lack stay on cached ESI.** Hardpoint kinds read `dogma_effects`; notification copy reads `name`; Hauling's last-resort volume reads `packaged_volume` (Hauling already takes packaged volume from the market catalogue first, issue #3894).
  - **Baking `dogma_effects` is cheap but deferred.** Measured against the committed shards with the Fuzzwork effect table (an estimate; the bake's source is CCP's JSONL): every type's full effect list adds ~34 KB gzip (~1.33 → ~1.36 MB, +2.5%); a hardpoint flag alone adds ~1 KB. The size is not the reason to wait. Re-baking means a full SDE rebuild, which pulls the latest export and rewrites every SDE file, so it belongs in its own change.
