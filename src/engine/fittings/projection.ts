/**
 * Several Fittings projecting onto one: each source's effects land once per
 * ship of it (three logistics cruisers, three sets of remote reps), while a
 * command burst's buff is handed over once — the engine keeps only the
 * strongest of a buff anyway, as the game does. Pure.
 */
import type { ProjectedEffects } from './types';

export interface ProjectionSource {
  projection: ProjectedEffects;
  /** Ships of this Fitting projecting. */
  count: number;
}

export function combineProjections(sources: readonly ProjectionSource[]): ProjectedEffects {
  const combined: ProjectedEffects = { buffs: [], effects: [] };
  for (const { projection, count } of sources) {
    if (count <= 0) continue;
    combined.buffs.push(...projection.buffs);
    for (let ship = 0; ship < count; ship++) combined.effects.push(...projection.effects);
  }
  return combined;
}
