import type { BlueprintMap, SkillType, TypeMap } from './types';

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
