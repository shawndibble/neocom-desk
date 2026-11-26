import type { ProjectedEffects } from './types';

export interface ProjectionSource {
  projection: ProjectedEffects;
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

export function projectsNothing(projected: ProjectedEffects | undefined): boolean {
  return !projected || (projected.buffs.length === 0 && projected.effects.length === 0);
}
