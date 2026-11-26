const COPYING_ACTIVITY_ID = 5;
const INVENTION_ACTIVITY_ID = 8;

export const GENERIC_DECRYPTOR_GROUP_ID = 1304;
const PROBABILITY_MULTIPLIER_ATTR = 1112;
const ME_MODIFIER_ATTR = 1113;
const TE_MODIFIER_ATTR = 1114;
const MAX_RUN_MODIFIER_ATTR = 1124;

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
