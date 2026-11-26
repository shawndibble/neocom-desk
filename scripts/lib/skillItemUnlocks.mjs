import { ASTEROID_CATEGORY_ID, MATERIAL_CATEGORY_ID, SKILL_CATEGORY_ID } from './bakeConstants.mjs';

export const REQUIRED_SKILL_ATTRIBUTE_PAIRS = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];

export const EXCLUDED_CATEGORY_IDS = new Set([
  SKILL_CATEGORY_ID,
  ASTEROID_CATEGORY_ID,
  MATERIAL_CATEGORY_ID,
]);

export function bakeSkillItemUnlocks(typeInfoShards, typeMap, groupCategories) {
  const bySkill = new Map();
  for (const shard of typeInfoShards) {
    for (const [id, record] of Object.entries(shard)) {
      const type = typeMap[id];
      if (!type) continue;
      const categoryId = groupCategories[type.groupID];
      if (categoryId === undefined || EXCLUDED_CATEGORY_IDS.has(categoryId)) continue;
      const attributes = new Map(record.attributes);
      for (const [skillAttr, levelAttr] of REQUIRED_SKILL_ATTRIBUTE_PAIRS) {
        const skill = attributes.get(skillAttr);
        const level = attributes.get(levelAttr);
        if (!skill || !level) continue;
        let items = bySkill.get(skill);
        if (!items) bySkill.set(skill, (items = new Map()));
        items.set(Number(id), Math.max(items.get(Number(id)) ?? 0, level));
      }
    }
  }
  const out = {};
  for (const skill of [...bySkill.keys()].sort((a, b) => a - b)) {
    out[skill] = [...bySkill.get(skill)].sort((a, b) => a[0] - b[0]);
  }
  return out;
}
