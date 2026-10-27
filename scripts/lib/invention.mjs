// invention.json (issue #3987): the copying and invention halves of a T1
// blueprint, kept apart from blueprints.json so manufacturing and reaction
// consumers read exactly what they did before. Every T1 blueprint has both
// manufacturing (1) and invention (8) rows, which blueprints.json's one
// activity tag per typeID cannot hold.
//
// Relics also invent under activity 8 (reverse engineering, T3); they are not
// blueprints, so `isBlueprint` drops them.

const COPYING_ACTIVITY_ID = 5;
const INVENTION_ACTIVITY_ID = 8;

// The decryptors in game since Crius. The four faction decryptor groups
// (728–731) and Hybrid (979, T3 only) are still in the dump with the same
// modifiers, but are not what a player can buy and use for T2 invention.
export const GENERIC_DECRYPTOR_GROUP_ID = 1304;
const PROBABILITY_MULTIPLIER_ATTR = 1112; // inventionPropabilityMultiplier (sic)
const ME_MODIFIER_ATTR = 1113; // inventionMEModifier
const TE_MODIFIER_ATTR = 1114; // inventionTEModifier
const MAX_RUN_MODIFIER_ATTR = 1124; // inventionMaxRunModifier

function inventionRowsByType(rows) {
  const map = new Map();
  for (const r of rows) {
    if (r.activityID !== INVENTION_ACTIVITY_ID) continue;
    let list = map.get(r.typeID);
    if (!list) {
      list = [];
      map.set(r.typeID, list);
    }
    list.push(r);
  }
  return map;
}

/**
 * `{ blueprintTypeId: { copyTime?, invention? } }` for blueprints that copy or
 * invent. An invention product's `quantity` is the invented copy's base runs.
 * Throws when a kept product has no positive success chance: a recipe without
 * one can't be priced, and the SDE has always carried it.
 * @param {{
 *   activities: {typeID:number,activityID:number,time:number}[],
 *   materials: {typeID:number,activityID:number,materialTypeID:number,quantity:number}[],
 *   products: {typeID:number,activityID:number,productTypeID:number,quantity:number}[],
 *   probabilities: {typeID:number,activityID:number,productTypeID:number,probability:number}[],
 *   skills: {typeID:number,activityID:number,skillID:number,level:number}[],
 *   isBlueprint: (typeID:number) => boolean,
 *   isPublished: (typeID:number) => boolean,
 * }} input
 */
export function bakeInvention({
  activities,
  materials,
  products,
  probabilities,
  skills,
  isBlueprint,
  isPublished,
}) {
  const materialsByType = inventionRowsByType(materials);
  const productsByType = inventionRowsByType(products);
  const skillsByType = inventionRowsByType(skills);
  const probability = new Map();
  for (const r of probabilities) {
    if (r.activityID !== INVENTION_ACTIVITY_ID) continue;
    probability.set(`${r.typeID}:${r.productTypeID}`, r.probability);
  }

  const byType = new Map();
  const entryFor = (typeID) => {
    let entry = byType.get(typeID);
    if (!entry) {
      entry = {};
      byType.set(typeID, entry);
    }
    return entry;
  };
  for (const { typeID, activityID, time } of activities) {
    if (!isBlueprint(typeID)) continue;
    if (activityID === COPYING_ACTIVITY_ID) {
      entryFor(typeID).copyTime = time;
    } else if (activityID === INVENTION_ACTIVITY_ID) {
      const invented = (productsByType.get(typeID) ?? []).filter((p) =>
        isPublished(p.productTypeID)
      );
      if (invented.length === 0) continue;
      entryFor(typeID).invention = {
        time,
        materials: (materialsByType.get(typeID) ?? []).map((m) => ({
          typeID: m.materialTypeID,
          quantity: m.quantity,
        })),
        products: invented.map((p) => {
          const chance = probability.get(`${typeID}:${p.productTypeID}`);
          if (!(chance > 0)) {
            throw new Error(
              `blueprint ${typeID} invents ${p.productTypeID} with no positive industryActivityProbabilities chance`
            );
          }
          return { typeID: p.productTypeID, quantity: p.quantity, probability: chance };
        }),
        skills: (skillsByType.get(typeID) ?? []).map((s) => ({
          typeID: s.skillID,
          level: s.level,
        })),
      };
    }
  }

  const out = {};
  for (const typeID of [...byType.keys()].sort((a, b) => a - b)) {
    out[typeID] = byType.get(typeID);
  }
  return out;
}

/**
 * `{ typeId: { name, probabilityMultiplier, me, te, runs } }` for the
 * published generic decryptors. `probabilityMultiplier` scales the base
 * chance (1.2 = +20%); `me`, `te` and `runs` add to the invented copy's ME,
 * TE and runs. A missing attribute reads as no change.
 * @param {{typeID:number,name:string,groupID:number,published:boolean}[]} types
 * @param {Map<number, Map<number, number|null>>} attrsByType
 */
export function bakeDecryptors(types, attrsByType) {
  const out = {};
  for (const t of types) {
    if (!t.published || t.groupID !== GENERIC_DECRYPTOR_GROUP_ID) continue;
    const attrs = attrsByType.get(t.typeID) ?? new Map();
    out[t.typeID] = {
      name: t.name,
      probabilityMultiplier: attrs.get(PROBABILITY_MULTIPLIER_ATTR) ?? 1,
      me: attrs.get(ME_MODIFIER_ATTR) ?? 0,
      te: attrs.get(TE_MODIFIER_ATTR) ?? 0,
      runs: attrs.get(MAX_RUN_MODIFIER_ATTR) ?? 0,
    };
  }
  return out;
}
