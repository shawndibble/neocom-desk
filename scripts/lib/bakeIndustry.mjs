// Blueprints, invention, market-wide trees, reprocessing, types.json and packaged volumes.
// Extracted from scripts/build-sde.mjs; see lib/bakeConstants.mjs for the shared bands.
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

export function bakeIndustry({ raw, types, groups, attrsByType, skills, ccpTypes }) {
  // --- blueprints.json (manufacturing + reaction, published items only) ---
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
      // A typeID under both manufacturing and reaction would silently
      // last-write-wins into one BlueprintType with the wrong activity tag.
      // Issue #460's decision doc records this as verified impossible against
      // a live dump; enforce that claim here rather than trusting it silently.
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

  const blueprints = {};
  for (const typeID of [...bpTime.keys()].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    if (!t || !t.published) continue; // strip unpublished blueprints/formulas
    const products = bpProducts.get(typeID);
    if (!products || products.length === 0) continue; // nothing made
    blueprints[typeID] = {
      name: t.name,
      time: bpTime.get(typeID),
      materials: bpMaterials.get(typeID) ?? [],
      products,
      skills: bpSkills.get(typeID) ?? [],
      activity: bpActivity.get(typeID),
    };
  }

  // --- invention.json: copy time, invention recipes and decryptors (issue
  // #3987); see lib/invention.mjs ---
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
          // A renamed column or blank cell would otherwise bake as NaN/0.
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

  // --- marketWideTrees.json: flattened manufacturing material trees for the
  // market-wide Build Opportunities scan (issue #819) ---
  //
  // For every manufacturing blueprint whose product is published and carries
  // a Market Group (the only products the scan could ever rank — an
  // unsellable product has no ISK/hour to compute), recursively expand any
  // material that is itself a manufacturing blueprint's product down to base
  // materials, at ME 0. This is an approximation (no ME/TE, no owned stock,
  // no auto-make-or-buy — `computeBuildPlan` still does the real math once a
  // row is turned into a Build Plan); what it buys is a scan that never
  // resolves a sub-build tree live over the whole SDE, which is the ticket's
  // explicit "precomputed, not resolved live" requirement.
  //
  // The recursion itself, and the total-job-time accumulation alongside it
  // (issue #1084 — `time` used to be the top blueprint's own time only,
  // discarding every folded-in sub-job's), live in `lib/flattenMarketWideTree.mjs`
  // so they're covered by a real fixture test without running this whole
  // download-and-bake pipeline.
  const manufacturingByProduct = new Map(); // productTypeID -> blueprintTypeID (first-wins, mirrors blueprintCatalog.ts)
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

  // --- reprocessing.json: typeID -> what refining it returns (issue #537) ---
  //
  // Restricted to PUBLISHED types that carry a market group: the one caller is
  // the "reprocess and sell the materials" comparison on an open market order,
  // and every type such an order can name is in that set. `invTypeMaterials`
  // covers most of the item universe, so baking it whole would multiply this
  // payload for rows nothing can reach.
  //
  // `quantity` is per `portionSize` units, NOT per unit — the field rides
  // along in each entry so a consumer cannot read the quantities without it.
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
        // Only stored when the SDE names one, i.e. attribute 790 is present —
        // its absence already means Scrapmetal Processing, so a value here
        // would just repeat SCRAPMETAL_PROCESSING_SKILL_ID on the ~1,100
        // non-ore refinable rows for no reader that needs it (issue #1058).
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

  // --- types.json: every referenced typeID -> {name, groupID, volume} ---
  const referenced = new Set();
  for (const s of skills) {
    referenced.add(s.typeID);
    for (const p of s.prereqs) referenced.add(p.skillTypeID);
  }
  // Material names and volumes for the refine comparison; the items
  // themselves are already referenced by whatever blueprint makes them, and
  // a market row carries its own name.
  //
  // The reprocessing KEYS ride along too — the ore, ice and scrap that
  // refines into those materials. Nothing else references raw ore (no
  // blueprint builds Veldspar), so without this every asteroid and ice type
  // was absent from types.json and the Mining Yield tab could not say how
  // many m3 a day of mining filled.
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
  // Every published type a Fitting can hold, blueprint or not: without them an
  // EFT paste naming an LP booster or a filament read "unknown item".
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

  // --- packaged volume for manufacturing material types (issue #1085) ---
  //
  // Restricted to types appearing as a manufacturing blueprint's material —
  // not the whole catalogue, and not reaction formulas (a reaction consumes
  // gas/salvage, never a hauled hull). Every such typeID is already in
  // typeMap from the pass above.
  const manufacturingMaterialTypeIds = new Set();
  for (const bp of Object.values(blueprints)) {
    if (bp.activity !== 'manufacturing') continue;
    for (const m of bp.materials) manufacturingMaterialTypeIds.add(m.typeID);
  }
  const packagedVolumeByType = packagedVolumesFrom(ccpTypes);
  let packagedVolumeApplied = 0;
  // Only the material types: types.json keeps #1085's scope rather than
  // growing a packaged figure for every hull it names as a blueprint product.
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
