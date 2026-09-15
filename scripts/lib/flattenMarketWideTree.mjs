// Pure logic behind `build-sde.mjs`'s market-wide tree bake (issue #819,
// #1084). Extracted so it's testable without running the whole download-CSVs
// pipeline: `flattenMarketWideTree` takes plain data structures the caller
// already has in memory (`blueprints`, `manufacturingByProduct`) and returns
// the flattened material map plus the tree's total job time.
//
// The default depth cap mirrors src/engine/industry/materialResolution.ts's
// MAX_SUB_BUILD_DEPTH.
export const MARKET_WIDE_MAX_DEPTH = 10;

/**
 * Recurses one blueprint's materials, expanding any material that is itself
 * a manufacturable product down to base materials at ME 0 — the cost side of
 * the bake, unchanged in shape from before issue #1084.
 *
 * Returns the *additional* job time this call's own recursion contributed
 * (issue #1084): every sub-blueprint it descends into runs `subMultiplier`
 * times (the same fractional multiplier the material quantities scale by —
 * building 1.5 runs' worth of a component is an honest fractional cost, not
 * rounded), so that sub-blueprint's own `time` scales the same way its
 * materials do. The caller adds this to the top blueprint's own time to get
 * the tree's total.
 */
function flattenRecursive(
  blueprintTypeID,
  multiplier,
  depth,
  materials,
  visited,
  blueprints,
  manufacturingByProduct,
  maxDepth
) {
  const bp = blueprints[blueprintTypeID];
  let subJobTime = 0;
  for (const material of bp.materials) {
    const subBlueprintTypeID = manufacturingByProduct.get(material.typeID);
    const subBp = subBlueprintTypeID !== undefined ? blueprints[subBlueprintTypeID] : undefined;
    const subOutput = subBp?.products.find((p) => p.typeID === material.typeID);
    if (
      subBlueprintTypeID !== undefined &&
      subOutput &&
      depth < maxDepth &&
      !visited.has(subBlueprintTypeID)
    ) {
      const subMultiplier = (multiplier * material.quantity) / subOutput.quantity;
      subJobTime += subMultiplier * subBp.time;
      subJobTime += flattenRecursive(
        subBlueprintTypeID,
        subMultiplier,
        depth + 1,
        materials,
        new Set(visited).add(subBlueprintTypeID),
        blueprints,
        manufacturingByProduct,
        maxDepth
      );
    } else {
      materials.set(
        material.typeID,
        (materials.get(material.typeID) ?? 0) + multiplier * material.quantity
      );
    }
  }
  return subJobTime;
}

/**
 * One blueprint's flattened market-wide tree: base materials for one run,
 * and the tree's total job time — the top job plus every sub-job folded in,
 * scaled the same way the material quantities are (issue #1084). A product
 * with no sub-builds returns the top blueprint's own `time` unchanged.
 *
 * Throws if the total ever comes out below the top job's own time: every
 * term `flattenRecursive` adds is non-negative by construction, so that can
 * only mean the accumulator itself regressed, not a fact about the data.
 */
export function flattenMarketWideTree(
  blueprintTypeID,
  blueprints,
  manufacturingByProduct,
  maxDepth = MARKET_WIDE_MAX_DEPTH
) {
  const bp = blueprints[blueprintTypeID];
  const materials = new Map();
  const subJobTime = flattenRecursive(
    blueprintTypeID,
    1,
    0,
    materials,
    new Set([blueprintTypeID]),
    blueprints,
    manufacturingByProduct,
    maxDepth
  );
  const time = bp.time + subJobTime;
  // `!Number.isFinite(time)`, not just `time < bp.time`: NaN and Infinity
  // (e.g. from a malformed sub-blueprint whose product quantity is 0,
  // dividing the sub-multiplier by zero) both compare false against
  // anything with `<`, so a plain regression check alone would let either
  // slip through as a "valid" total instead of failing the bake.
  if (!Number.isFinite(time) || time < bp.time) {
    throw new Error(
      `market-wide tree time for blueprint ${blueprintTypeID} came out below its own top-job time, or non-finite (${time}, top-job ${bp.time}) — the sub-job time accumulator regressed`
    );
  }
  return { materials, time };
}
