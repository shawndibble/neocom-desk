// typeEffects.json: for each dogma effect on the allow-list, the published
// types that carry it, ids sorted. The dogma engine's results hold attributes
// and state, never effects, so a fact that is only an effect (a Covert Ops
// cloak's "warps cloaked", effect 980) has to be baked. A later need adds an
// entry here, not a new file.

/** effectID -> name, for the effects the app reads. Mirrored by `src/engine/fittings/explore.ts` (980). */
export const TYPE_EFFECTS_OF_INTEREST = { 980: 'cloakingWarpSafe' };

/**
 * `{ "<effectID>": [typeId, ...] }` for every allow-listed effect, published
 * types only. `types`/`typeDogma` are parsed `types.jsonl`/`typeDogma.jsonl`.
 */
export function bakeTypeEffects(types, typeDogma) {
  const published = new Set(types.filter((t) => t.published).map((t) => t._key));
  const byEffect = Object.fromEntries(Object.keys(TYPE_EFFECTS_OF_INTEREST).map((id) => [id, []]));
  for (const record of typeDogma) {
    if (!published.has(record._key)) continue;
    for (const { effectID } of record.dogmaEffects ?? []) {
      byEffect[effectID]?.push(record._key);
    }
  }
  for (const ids of Object.values(byEffect)) ids.sort((a, b) => a - b);
  return byEffect;
}
