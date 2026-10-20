// Groups, types, skill/ship ids, dogma attributes, masteries, skill modifiers and skills.json.
// Extracted from scripts/build-sde.mjs; see lib/bakeConstants.mjs for the shared bands.
import {
  CHAR_ATTR_NAMES,
  MASTERY_TIER_COUNT,
  POST_PERCENT_OPERATION,
  PREREQ_PAIRS,
  PRIMARY_ATTR,
  RANK_ATTR,
  SECONDARY_ATTR,
  SHIP_CATEGORY_ID,
  SKILL_CATEGORY_ID,
  SKILL_GATED_MODIFIER_FUNCS,
} from './bakeConstants.mjs';
import { indexHeader, isRefinable, num } from './bakeCsv.mjs';
import { PI_LINK_TYPE_ID, PI_PIN_GROUPS } from './bakePi.mjs';
import { GENERIC_DECRYPTOR_GROUP_ID } from './invention.mjs';
import { WORMHOLE_GROUP_ID } from './jumpMass.mjs';

export function bakeSkills({ raw }) {
  // --- invGroups: groupID -> {name, categoryID} ---
  const groups = new Map();
  {
    const rows = raw['invGroups.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      groups.set(Number(r[h.groupID]), {
        name: r[h.groupName],
        categoryID: Number(r[h.categoryID]),
      });
    }
  }

  // --- invTypes: typeID -> {name, groupID, volume, published} ---
  const types = new Map();
  {
    const rows = raw['invTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      types.set(Number(r[h.typeID]), {
        name: r[h.typeName],
        description: r[h.description] ?? '',
        groupID: Number(r[h.groupID]),
        volume: num(r[h.volume]) ?? 0,
        mass: num(r[h.mass]) ?? 0,
        // Units that must be reprocessed together. `invTypeMaterials`
        // quantities are per portion, not per unit, so nothing can price a
        // refine without this (issue #537).
        portionSize: num(r[h.portionSize]) ?? 1,
        // What the type holds, not what it takes up: a Launchpad's 10,000 m3
        // and a Storage Facility's 12,000 are the colony's whole buffer.
        capacity: num(r[h.capacity]) ?? 0,
        // A skillbook's fixed NPC sell price, where NPCs seed it: NPC orders
        // for Upwell Hauler across The Forge all sit at exactly its 2,000,000.
        basePrice: num(r[h.basePrice]) ?? 0,
        published: r[h.published] === '1',
        marketGroupID: r[h.marketGroupID] === '' ? null : Number(r[h.marketGroupID]),
      });
    }
  }

  // --- Skill type IDs: published types whose group is in category 16 ---
  const skillTypeIds = new Set();
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    const g = groups.get(t.groupID);
    if (g && g.categoryID === SKILL_CATEGORY_ID) skillTypeIds.add(typeID);
  }

  // --- Ship type IDs: published types whose group is in category 6 ---
  const shipTypeIds = new Set();
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    const g = groups.get(t.groupID);
    if (g && g.categoryID === SHIP_CATEGORY_ID) shipTypeIds.add(typeID);
  }

  // --- Planetary pin type IDs: published types in the six pin groups ---
  const piPinTypeIds = new Set();
  for (const [typeID, t] of types) {
    if (t.published && PI_PIN_GROUPS[t.groupID]) piPinTypeIds.add(typeID);
  }

  // --- Refinable type IDs: `isRefinable`, the same predicate reprocessing.json's
  // own build uses below — computed here, ahead of the reprocessing.json pass
  // itself, purely so the dgmTypeAttributes pass right below knows which
  // types to keep attribute 790 for (issue #1058).
  const refinableTypeIds = new Set();
  {
    const rows = raw['invTypeMaterials.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const typeID = Number(rows[i][h.typeID]);
      if (isRefinable(types.get(typeID))) refinableTypeIds.add(typeID);
    }
  }

  // --- dgmTypeAttributes: attrs for skill types, planetary pins, and refinable types ---
  const attrsByType = new Map(); // typeID -> Map(attrID -> value)
  {
    const rows = raw['dgmTypeAttributes.csv'];
    const h = indexHeader(rows);
    const iType = h.typeID;
    const iAttr = h.attributeID;
    const iInt = h.valueInt;
    const iFloat = h.valueFloat;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const typeID = Number(r[iType]);
      if (
        !skillTypeIds.has(typeID) &&
        !piPinTypeIds.has(typeID) &&
        typeID !== PI_LINK_TYPE_ID &&
        !refinableTypeIds.has(typeID) &&
        !shipTypeIds.has(typeID) &&
        types.get(typeID)?.groupID !== WORMHOLE_GROUP_ID &&
        types.get(typeID)?.groupID !== GENERIC_DECRYPTOR_GROUP_ID
      )
        continue;
      const value = r[iInt] !== '' ? Number(r[iInt]) : num(r[iFloat]);
      let m = attrsByType.get(typeID);
      if (!m) {
        m = new Map();
        attrsByType.set(typeID, m);
      }
      m.set(Number(r[iAttr]), value);
    }
  }

  // --- Alpha skill caps: typeID -> highest level an Alpha clone can train ---
  // One clone grade per starter race; they have matched since CCP let Alphas
  // train every race's skills, so any disagreement is surfaced, not guessed at.
  const alphaMaxLevel = new Map();
  let alphaGradesDisagree = false;
  {
    const rows = raw['chrCloneGradeSkills.csv'];
    const h = indexHeader(rows);
    const byGrade = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 3) continue;
      const grade = Number(r[h.cloneGradeID]);
      const typeID = Number(r[h.typeID]);
      const level = Number(r[h.level]);
      let m = byGrade.get(grade);
      if (!m) byGrade.set(grade, (m = new Map()));
      m.set(typeID, level);
      alphaMaxLevel.set(typeID, Math.max(alphaMaxLevel.get(typeID) ?? 0, level));
    }
    for (const m of byGrade.values()) {
      if (m.size !== alphaMaxLevel.size) alphaGradesDisagree = true;
      for (const [typeID, level] of m)
        if (alphaMaxLevel.get(typeID) !== level) alphaGradesDisagree = true;
    }
  }

  // --- masteries.json: shipTypeID -> 5 tiers -> [{skillTypeID, level}] ---
  // certSkills: certID+certLevelInt -> [{skillTypeID, level}]
  const certSkillsByCert = new Map();
  {
    const rows = raw['certSkills.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 5) continue;
      const certID = Number(r[h.certID]);
      const certLevelInt = Number(r[h.certLevelInt]);
      const skillTypeID = Number(r[h.skillID]);
      const level = Number(r[h.skillLevel]);
      const key = `${certID}:${certLevelInt}`;
      let list = certSkillsByCert.get(key);
      if (!list) certSkillsByCert.set(key, (list = []));
      list.push({ skillTypeID, level });
    }
  }
  // certMasteries: shipTypeID -> masteryLevel (0-4) -> [certID]
  const masteries = {};
  {
    const rows = raw['certMasteries.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 3) continue;
      const typeID = Number(r[h.typeID]);
      if (!shipTypeIds.has(typeID)) continue;
      const masteryLevel = Number(r[h.masteryLevel]);
      if (!(masteryLevel >= 0 && masteryLevel < MASTERY_TIER_COUNT)) continue;
      const certID = Number(r[h.certID]);
      const certLevelInt = masteryLevel + 1;
      const bundle = certSkillsByCert.get(`${certID}:${certLevelInt}`) ?? [];
      let tiers = masteries[typeID];
      if (!tiers) tiers = masteries[typeID] = Array.from({ length: MASTERY_TIER_COUNT }, () => []);
      // A tier can draw from more than one cert; the max level wins where
      // the same skill appears twice, same rule fitToSkills.ts uses for a
      // fit's hull + items disagreeing on a skill's required level.
      const bySkill = new Map(tiers[masteryLevel].map((e) => [e.skillTypeID, e.level]));
      for (const { skillTypeID, level } of bundle) {
        bySkill.set(skillTypeID, Math.max(bySkill.get(skillTypeID) ?? 0, level));
      }
      tiers[masteryLevel] = [...bySkill].map(([skillTypeID, level]) => ({ skillTypeID, level }));
    }
  }

  // --- skillAttributeModifiers.json: modifiedAttributeID -> skill bonuses affecting it ---
  // A skill-gated modifier row's own `skillTypeID` only *gates* the bonus (an
  // item must require that skill for it to apply) — the bonus's actual
  // source is whichever type the effect is attached to (dgmTypeEffects),
  // which is usually NOT a skill at all: implants, ship set bonuses and
  // subsystems reuse this exact mechanism. Filtering to effects owned by an
  // actual skill type turns ~2300 candidate rows into the couple hundred
  // genuinely skill-driven ones. `perLevelValue` is the owning skill's own
  // static per-level design value (e.g. Sharpshooter's own attribute 294 =
  // 5, "5% per level") — baked in here rather than fetched at runtime, since
  // it's already static SDE data this build already has in hand.
  const effectModifierInfo = new Map(); // effectID -> parsed modifierInfo array
  {
    const rows = raw['dgmEffects.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length <= h.modifierInfo) continue;
      const cell = r[h.modifierInfo];
      if (!cell) continue;
      let parsed;
      try {
        parsed = JSON.parse(cell);
      } catch {
        continue; // malformed JSON in this one cell isn't fatal to the build
      }
      if (Array.isArray(parsed)) effectModifierInfo.set(Number(r[h.effectID]), parsed);
    }
  }
  const effectOwnerTypes = new Map(); // effectID -> [typeID, ...]
  {
    const rows = raw['dgmTypeEffects.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) continue;
      const effectID = Number(r[h.effectID]);
      const typeID = Number(r[h.typeID]);
      let list = effectOwnerTypes.get(effectID);
      if (!list) effectOwnerTypes.set(effectID, (list = []));
      list.push(typeID);
    }
  }
  const skillAttributeModifiers = {};
  let skillAttributeModifierUnresolved = 0;
  for (const [effectID, entries] of effectModifierInfo) {
    const ownerSkillTypeIDs = (effectOwnerTypes.get(effectID) ?? []).filter((t) =>
      skillTypeIds.has(t)
    );
    if (ownerSkillTypeIDs.length === 0) continue;
    for (const entry of entries) {
      if (!SKILL_GATED_MODIFIER_FUNCS.has(entry.func)) continue;
      if (entry.operation !== POST_PERCENT_OPERATION) continue;
      const modifiedAttributeID = entry.modifiedAttributeID;
      const gatingSkillTypeID = entry.skillTypeID;
      const sourceAttributeID = entry.modifyingAttributeID;
      if (modifiedAttributeID == null || gatingSkillTypeID == null || sourceAttributeID == null)
        continue;
      for (const ownerSkillTypeID of ownerSkillTypeIDs) {
        const perLevelValue = attrsByType.get(ownerSkillTypeID)?.get(sourceAttributeID);
        if (!perLevelValue) {
          skillAttributeModifierUnresolved++;
          continue;
        }
        let list = skillAttributeModifiers[modifiedAttributeID];
        if (!list) list = skillAttributeModifiers[modifiedAttributeID] = [];
        list.push({ ownerSkillTypeID, gatingSkillTypeID, perLevelValue });
      }
    }
  }

  // --- skills.json ---
  const skills = [];
  for (const typeID of [...skillTypeIds].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    const g = groups.get(t.groupID);
    const attrs = attrsByType.get(typeID) ?? new Map();
    const prereqs = [];
    for (const [skillAttr, levelAttr] of PREREQ_PAIRS) {
      const skillTypeID = attrs.get(skillAttr);
      if (skillTypeID == null) continue;
      prereqs.push({
        skillTypeID: Math.round(skillTypeID),
        level: Math.round(attrs.get(levelAttr) ?? 1),
      });
    }
    skills.push({
      typeID,
      name: t.name,
      description: t.description,
      groupID: t.groupID,
      groupName: g.name,
      rank: Math.round(attrs.get(RANK_ATTR) ?? 1),
      primaryAttr: CHAR_ATTR_NAMES[attrs.get(PRIMARY_ATTR)] ?? null,
      secondaryAttr: CHAR_ATTR_NAMES[attrs.get(SECONDARY_ATTR)] ?? null,
      prereqs,
      ...(t.basePrice > 0 ? { basePrice: t.basePrice } : {}),
      // Omitted for Omega-only skills (most of them), which the app reads as 0.
      ...(alphaMaxLevel.get(typeID) > 0 ? { alphaMaxLevel: alphaMaxLevel.get(typeID) } : {}),
    });
  }

  return {
    groups,
    types,
    piPinTypeIds,
    attrsByType,
    alphaGradesDisagree,
    masteries,
    skillAttributeModifiers,
    skillAttributeModifierUnresolved,
    skills,
  };
}
