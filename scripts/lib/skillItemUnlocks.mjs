// skillItemUnlocks.json: for each skill, the non-skill items (ships, modules,
// charges, drones, implants…) whose own requiredSkillN attributes name it, and
// the level each needs. The reverse of what Item Detail's Required skills reads
// per type, which would otherwise mean fetching every typeInfo shard to answer
// "what does Gunnery IV unlock?" in the skill Show info. Skill-on-skill unlocks
// are not here: the app derives those from skills.json's prereqs.

/**
 * requiredSkillN / requiredSkillNLevel dogma attribute id pairs. Mirrors
 * `SKILL_REQUIREMENT_PAIRS` in `src/engine/market/itemAttributes.ts` (the test
 * checks they match).
 */
export const REQUIRED_SKILL_ATTRIBUTE_PAIRS = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];

/**
 * Inventory categories left out: skills (unlocked via skills.json), and
 * asteroids and raw materials, whose "required skill" is the one to mine or
 * reprocess them, not one that unlocks using them.
 */
export const EXCLUDED_CATEGORY_IDS = new Set([16, 25, 4]);

/**
 * `{ "<skillTypeId>": [[typeId, level], ...] }`, pairs sorted by typeId, for
 * every type in `typeMap` (types.json: id -> `{ groupID }`) whose typeInfo
 * shard record carries a required skill. `groupCategories` is groupID ->
 * categoryID. A type naming the same skill twice keeps the higher level.
 */
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
