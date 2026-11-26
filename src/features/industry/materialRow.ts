import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { HubPrices, MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import type { MaterialTableRow } from './subBuildPlan';

export type PriceSource = 'hub' | 'override' | 'none';

export interface MaterialRowState {
  priceSource: PriceSource;
  unitPrice: number | null;
  fullyOwned: boolean;
  lineCost: number | null;
}

export function materialRowState(
  material: MaterialCostLine,
  sourcing: MaterialSourcingMap | undefined,
  pricesReady: boolean
): MaterialRowState {
  const overridden = sourcing?.[material.typeID]?.overridePrice !== undefined;
  const fullyOwned = material.remainingQuantity === 0;
  const priceSource: PriceSource =
    material.unitPrice === null ? 'none' : overridden ? 'override' : pricesReady ? 'hub' : 'none';
  return {
    priceSource,
    unitPrice: priceSource === 'none' ? null : material.unitPrice,
    fullyOwned,
    lineCost: priceSource === 'none' && !fullyOwned ? null : material.lineCost,
  };
}

export function buyPricedLine(
  material: MaterialCostLine,
  sourcing: MaterialSourcingMap | undefined,
  materialPrices: HubPrices
): MaterialCostLine {
  if (material.unitPrice !== null) return material;
  const candidate = sourcing?.[material.typeID]?.overridePrice ?? materialPrices[material.typeID];
  const unitPrice =
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
      ? candidate
      : null;
  return unitPrice === null ? material : { ...material, unitPrice };
}

export function isBuilt(material: MaterialTableRow): boolean {
  return material.subBuilds.length > 0;
}

export type PriceTag = 'override' | 'hub' | 'owned' | 'unpriced';

export function materialPriceTag(
  material: MaterialTableRow,
  sourcing: MaterialSourcingMap | undefined,
  pricesReady: boolean
): PriceTag | null {
  if (isBuilt(material)) return material.unpriced ? 'unpriced' : null;
  const state = materialRowState(material, sourcing, pricesReady);
  if (state.priceSource === 'override') return 'override';
  if (state.unitPrice !== null) return 'hub';
  return state.fullyOwned ? 'owned' : 'unpriced';
}

export function buildSavings(
  material: Pick<MaterialCostLine, 'remainingQuantity'>,
  advice: MakeOrBuy | undefined
): number | null {
  return advice?.verdict === 'build' && advice.savings > 0 && material.remainingQuantity > 0
    ? advice.savings
    : null;
}

export function shownDepth(
  material: MaterialTableRow,
  sourcing: MaterialSourcingMap | undefined,
  depthFor: ((typeID: number) => DepthPrice | undefined) | undefined
): DepthPrice | undefined {
  if (isBuilt(material) || sourcing?.[material.typeID]?.overridePrice !== undefined) {
    return undefined;
  }
  return depthFor?.(material.typeID);
}
