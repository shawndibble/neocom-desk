export const TYPE_EFFECTS_OF_INTEREST = { 980: 'cloakingWarpSafe' };

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
