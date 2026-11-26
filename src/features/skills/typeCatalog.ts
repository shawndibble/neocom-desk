import { loadSkills, loadTypes } from '@/sde/loadSde';

export interface TypeCatalogEntry {
  typeID: number;
}

export async function loadSkillNameMap(): Promise<Map<string, TypeCatalogEntry>> {
  const skills = await loadSkills();
  const map = new Map<string, TypeCatalogEntry>();
  for (const skill of skills) map.set(skill.name.toLowerCase(), { typeID: skill.typeID });
  return map;
}

let itemNameMapPromise: Promise<Map<string, TypeCatalogEntry>> | null = null;

export function loadItemNameMap(): Promise<Map<string, TypeCatalogEntry>> {
  itemNameMapPromise ??= (async () => {
    const [types, skills] = await Promise.all([loadTypes(), loadSkills()]);
    const map = new Map<string, TypeCatalogEntry>();
    for (const [id, info] of Object.entries(types)) {
      map.set(info.name.toLowerCase(), { typeID: Number(id) });
    }
    for (const skill of skills) {
      const key = skill.name.toLowerCase();
      if (!map.has(key)) map.set(key, { typeID: skill.typeID });
    }
    return map;
  })().catch((error: unknown) => {
    itemNameMapPromise = null;
    throw error;
  });
  return itemNameMapPromise;
}
