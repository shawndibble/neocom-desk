import type { BlueprintMap, PiData, SkillType, TypeMap } from './types';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function cached<T>(file: string): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= fetchJson<T>(file).catch((err) => {
      promise = null; // allow retry after failure
      throw err;
    });
    return promise;
  };
}

export const loadSkills = cached<SkillType[]>('skills.json');
export const loadBlueprints = cached<BlueprintMap>('blueprints.json');
export const loadTypes = cached<TypeMap>('types.json');
export const loadPi = cached<PiData>('pi.json');
/**
 * Per-planet radius in km, keyed by planetId — the one input a link's cost
 * needs that is neither a dogma attribute nor in ESI (issue #440).
 *
 * Its own file rather than part of `pi.json`: it is one entry per planet in
 * New Eden (~68k, 328 KB gzipped), and only the Advisor needs it, so every
 * other consumer of `pi.json` would otherwise pay for it on load.
 */
export const loadPiPlanetRadius = cached<Record<string, number>>('pi-planet-radius.json');
