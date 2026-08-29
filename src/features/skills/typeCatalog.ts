/**
 * Case-insensitive item-name -> typeID lookups for resolving pasted EFT fit
 * text (ship + module + charge names) and plain skill-plan-paste text (skill
 * names) to typeIDs. Adapts src/sde (read-only) to the shapes the clipboard
 * import parsers expect.
 */
import { loadSkills, loadTypes } from '@/sde/loadSde';

export interface TypeCatalogEntry {
  typeID: number;
}

/** Skill names only (skills.json) — used for the skill-plan-paste path. */
export async function loadSkillNameMap(): Promise<Map<string, TypeCatalogEntry>> {
  const skills = await loadSkills();
  const map = new Map<string, TypeCatalogEntry>();
  for (const skill of skills) map.set(skill.name.toLowerCase(), { typeID: skill.typeID });
  return map;
}

/**
 * Ship/module/charge names (types.json), with skill names filling any gaps —
 * used for the EFT-fit path (a fit's hull + items are always types.json
 * entries; skills.json is a fallback, never allowed to shadow an item name).
 */
export async function loadItemNameMap(): Promise<Map<string, TypeCatalogEntry>> {
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
}
