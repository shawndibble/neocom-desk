export const MARKET_WIDE_MAX_DEPTH = 10;

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
  if (!Number.isFinite(time) || time < bp.time) {
    throw new Error(
      `market-wide tree time for blueprint ${blueprintTypeID} came out below its own top-job time, or non-finite (${time}, top-job ${bp.time}) — the sub-job time accumulator regressed`
    );
  }
  return { materials, time };
}
