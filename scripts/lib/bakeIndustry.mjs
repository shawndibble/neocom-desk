import {
  BLUEPRINT_CATEGORY_ID,
  MANUFACTURING_ACTIVITY_ID,
  REACTION_ACTIVITY_ID,
  REPROCESSING_SKILL_ATTR,
} from './bakeConstants.mjs';
import { indexHeader, isRefinable, packagedVolumesFrom } from './bakeCsv.mjs';
import { fitTypeIds } from './fitTypeIds.mjs';
import { MARKET_WIDE_MAX_DEPTH, flattenMarketWideTree } from './flattenMarketWideTree.mjs';
import { bakeDecryptors, bakeInvention } from './invention.mjs';
import { productRigScope, verifyRigScopeAttributes } from './rigScope.mjs';

export function bakeIndustry({ raw, types, groups, attrsByType, skills, ccpTypes }) {
  const ACTIVITY_TAG = {
    [MANUFACTURING_ACTIVITY_ID]: 'manufacturing',
    [REACTION_ACTIVITY_ID]: 'reaction',
  };
  const bpTime = new Map();
  const bpActivity = new Map();
  {
    const rows = raw['industryActivity.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const activityID = Number(r[h.activityID]);
      const activity = ACTIVITY_TAG[activityID];
      if (!activity) continue;
      const typeID = Number(r[h.typeID]);
      const existing = bpActivity.get(typeID);
      if (existing && existing !== activity) {
        throw new Error(
          `typeID ${typeID} has industryActivity rows under both '${existing}' and '${activity}' — the manufacturing/reaction activity split assumed these are disjoint`
        );
      }
      bpTime.set(typeID, Number(r[h.time]));
      bpActivity.set(typeID, activity);
    }
  }
  const collectActivity = (fileName, idCol, qtyCol) => {
    const rows = raw[fileName];
    const h = indexHeader(rows);
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!ACTIVITY_TAG[Number(r[h.activityID])]) continue;
      const typeID = Number(r[h.typeID]);
      let list = map.get(typeID);
      if (!list) {
        list = [];
        map.set(typeID, list);
      }
      list.push({ typeID: Number(r[h[idCol]]), quantity: Number(r[h[qtyCol]]) });
    }
    return map;
  };
  const bpMaterials = collectActivity(
    'industryActivityMaterials.csv',
    'materialTypeID',
    'quantity'
  );
  const bpProducts = collectActivity('industryActivityProducts.csv', 'productTypeID', 'quantity');
  const bpSkills = new Map();
  {
    const rows = raw['industryActivitySkills.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!ACTIVITY_TAG[Number(r[h.activityID])]) continue;
      const typeID = Number(r[h.typeID]);
      let list = bpSkills.get(typeID);
      if (!list) {
        list = [];
        bpSkills.set(typeID, list);
      }
      list.push({ typeID: Number(r[h.skillID]), level: Number(r[h.level]) });
    }
  }

  const maxProductionLimit = new Map();
  {
    const rows = raw['industryBlueprints.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const limit = Number(rows[i][h.maxProductionLimit]);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`industryBlueprints.csv row ${i}: 'maxProductionLimit' is not a run count`);
      }
      maxProductionLimit.set(Number(rows[i][h.typeID]), limit);
    }
  }

  {
    const rows = raw['dgmAttributeTypes.csv'];
    const h = indexHeader(rows);
    verifyRigScopeAttributes(
      rows.slice(1).map((r) => ({ attributeID: r[h.attributeID], description: r[h.description] }))
    );
  }
  const metaGroupByType = new Map();
  {
    const rows = raw['invMetaTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      metaGroupByType.set(Number(rows[i][h.typeID]), Number(rows[i][h.metaGroupID]));
    }
  }
  const rigScopeOf = (productTypeID) => {
    const product = types.get(productTypeID);
    if (!product) return undefined;
    return productRigScope({
      categoryID: groups.get(product.groupID)?.categoryID,
      groupID: product.groupID,
      metaGroupID: metaGroupByType.get(productTypeID),
    });
  };

  const blueprints = {};
  for (const typeID of [...bpTime.keys()].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    if (!t || !t.published) continue;
    const products = bpProducts.get(typeID);
    if (!products || products.length === 0) continue;
    const rigScope =
      bpActivity.get(typeID) === 'manufacturing' ? rigScopeOf(products[0].typeID) : undefined;
    blueprints[typeID] = {
      name: t.name,
      time: bpTime.get(typeID),
      materials: bpMaterials.get(typeID) ?? [],
      products,
      skills: bpSkills.get(typeID) ?? [],
      activity: bpActivity.get(typeID),
      ...(maxProductionLimit.has(typeID) && { maxProductionLimit: maxProductionLimit.get(typeID) }),
      ...(rigScope && { rigScope }),
    };
  }

  const typeRows = [...types].map(([typeID, t]) => ({ typeID, ...t }));
  const inventionData = (() => {
    const rowsOf = (fileName, cols) => {
      const rows = raw[fileName];
      const h = indexHeader(rows);
      const out = [];
      for (let i = 1; i < rows.length; i++) {
        const row = {};
        for (const c of cols) {
          row[c] = Number(rows[i][h[c]]);
          if (rows[i][h[c]] === '' || !Number.isFinite(row[c])) {
            throw new Error(`${fileName} row ${i}: '${c}' is not a number`);
          }
        }
        out.push(row);
      }
      return out;
    };
    const isPublished = (typeID) => types.get(typeID)?.published === true;
    return {
      blueprints: bakeInvention({
        activities: rowsOf('industryActivity.csv', ['typeID', 'activityID', 'time']),
        materials: rowsOf('industryActivityMaterials.csv', [
          'typeID',
          'activityID',
          'materialTypeID',
          'quantity',
        ]),
        products: rowsOf('industryActivityProducts.csv', [
          'typeID',
          'activityID',
          'productTypeID',
          'quantity',
        ]),
        probabilities: rowsOf('industryActivityProbabilities.csv', [
          'typeID',
          'activityID',
          'productTypeID',
          'probability',
        ]),
        skills: rowsOf('industryActivitySkills.csv', ['typeID', 'activityID', 'skillID', 'level']),
        isBlueprint: (typeID) =>
          isPublished(typeID) &&
          groups.get(types.get(typeID).groupID)?.categoryID === BLUEPRINT_CATEGORY_ID,
        isPublished,
      }),
      decryptors: bakeDecryptors(typeRows, attrsByType),
    };
  })();

  const manufacturingByProduct = new Map();
  for (const [typeID, bp] of Object.entries(blueprints)) {
    if (bp.activity !== 'manufacturing') continue;
    const product = bp.products[0];
    if (!product) continue;
    if (!manufacturingByProduct.has(product.typeID)) {
      manufacturingByProduct.set(product.typeID, Number(typeID));
    }
  }
  const marketWideTrees = {};
  for (const [productTypeID, blueprintTypeID] of manufacturingByProduct) {
    const productType = types.get(productTypeID);
    if (!productType || !productType.published || productType.marketGroupID === null) continue;
    const bp = blueprints[blueprintTypeID];
    const product = bp.products.find((p) => p.typeID === productTypeID);
    const { materials, time } = flattenMarketWideTree(
      blueprintTypeID,
      blueprints,
      manufacturingByProduct,
      MARKET_WIDE_MAX_DEPTH
    );
    marketWideTrees[productTypeID] = {
      blueprintTypeID,
      time,
      outputQuantity: product.quantity,
      marketGroupID: productType.marketGroupID,
      materials: [...materials].map(([typeID, quantity]) => ({ typeID, quantity })),
    };
  }

  const reprocessing = {};
  {
    const rows = raw['invTypeMaterials.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const typeID = Number(r[h.typeID]);
      const t = types.get(typeID);
      if (!isRefinable(t)) continue;
      const quantity = Number(r[h.quantity]);
      if (!(quantity > 0)) continue;
      let entry = reprocessing[typeID];
      if (!entry) {
        entry = { portionSize: t.portionSize, materials: [] };
        const specialisationSkillID = attrsByType.get(typeID)?.get(REPROCESSING_SKILL_ATTR);
        if (specialisationSkillID != null) {
          entry.specialisationSkillID = Math.round(specialisationSkillID);
        }
        reprocessing[typeID] = entry;
      }
      entry.materials.push({ typeID: Number(r[h.materialTypeID]), quantity });
    }
    for (const entry of Object.values(reprocessing)) {
      entry.materials.sort((a, b) => a.typeID - b.typeID);
    }
  }

  const referenced = new Set();
  for (const s of skills) {
    referenced.add(s.typeID);
    for (const p of s.prereqs) referenced.add(p.skillTypeID);
  }
  for (const [typeID, entry] of Object.entries(reprocessing)) {
    referenced.add(Number(typeID));
    for (const m of entry.materials) referenced.add(m.typeID);
  }
  for (const [typeID, bp] of Object.entries(blueprints)) {
    referenced.add(Number(typeID));
    for (const m of bp.materials) referenced.add(m.typeID);
    for (const p of bp.products) referenced.add(p.typeID);
    for (const sk of bp.skills) referenced.add(sk.typeID);
  }
  for (const typeID of fitTypeIds(types, groups)) referenced.add(typeID);
  const typeMap = {};
  for (const typeID of [...referenced].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    if (!t) {
      console.warn(`  WARN: referenced typeID ${typeID} missing from invTypes`);
      continue;
    }
    typeMap[typeID] = { name: t.name, groupID: t.groupID, volume: t.volume };
  }

  const manufacturingMaterialTypeIds = new Set();
  for (const bp of Object.values(blueprints)) {
    if (bp.activity !== 'manufacturing') continue;
    for (const m of bp.materials) manufacturingMaterialTypeIds.add(m.typeID);
  }
  const packagedVolumeByType = packagedVolumesFrom(ccpTypes);
  let packagedVolumeApplied = 0;
  for (const typeID of manufacturingMaterialTypeIds) {
    const packagedVolume = packagedVolumeByType.get(typeID);
    if (packagedVolume === undefined) continue;
    const entry = typeMap[typeID];
    if (entry && packagedVolume !== entry.volume) {
      entry.packagedVolume = packagedVolume;
      packagedVolumeApplied++;
    }
  }

  return {
    blueprints,
    typeRows,
    inventionData,
    marketWideTrees,
    reprocessing,
    typeMap,
    manufacturingMaterialTypeIds,
    packagedVolumeByType,
    packagedVolumeApplied,
  };
}
