import type { AcquisitionTier, MaterialCostLine } from './types';

export function mergeCostLines(
  existing: MaterialCostLine,
  line: MaterialCostLine
): MaterialCostLine {
  return {
    typeID: existing.typeID,
    baseQuantity: existing.baseQuantity + line.baseQuantity,
    quantity: existing.quantity + line.quantity,
    ownedQuantity: existing.ownedQuantity + line.ownedQuantity,
    remainingQuantity: existing.remainingQuantity + line.remainingQuantity,
    unitPrice: existing.unitPrice ?? line.unitPrice,
    lineCost: existing.lineCost + line.lineCost,
    unpriced: existing.unpriced || line.unpriced,
    ...((existing.acquisitionTier ?? line.acquisitionTier)
      ? { acquisitionTier: mergedTier(existing.acquisitionTier, line.acquisitionTier) }
      : {}),
  };
}

function mergedTier(
  existing: AcquisitionTier | undefined,
  line: AcquisitionTier | undefined
): AcquisitionTier | undefined {
  if (!existing || !line) return existing ?? line;
  if (existing.me !== line.me || existing.te !== line.te) {
    return {
      me: existing.me,
      te: existing.te,
      ...(existing.community ? { community: existing.community } : {}),
      ...(existing.invented ? { invented: existing.invented } : {}),
    };
  }
  if (!existing.pool || !line.pool) return existing;
  return {
    ...existing,
    pool: { ...existing.pool, neededRuns: existing.pool.neededRuns + line.pool.neededRuns },
  };
}
