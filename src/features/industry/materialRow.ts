/**
 * What one materials row displays, decided once for every surface that shows
 * it (the table and the CSV export, which used to derive it separately and
 * could therefore disagree).
 *
 * Two rules the engine can't express on its own:
 *
 * - Where a unit price came from is not recoverable from `MaterialCostLine` —
 *   an override equal to the hub price resolves to the same number — so the
 *   provenance is read from the plan's raw overrides instead.
 * - `pricesReady` (the market snapshot loaded) gates a *hub* price only. An
 *   override is the player's own number and needs no market data, and an
 *   entirely owned row costs zero whether anything is priced or not.
 */

import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { HubPrices, MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import type { MaterialTableRow } from './subBuildPlan';

/** Where a displayed unit price came from. `none` means there is nothing to show. */
export type PriceSource = 'hub' | 'override' | 'none';

export interface MaterialRowState {
  priceSource: PriceSource;
  /** Unit price to display; null when `priceSource` is `none`. */
  unitPrice: number | null;
  /** Owned units cover the whole requirement, so the row costs nothing. */
  fullyOwned: boolean;
  /** Line total to display; null when it cannot be known. */
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
    // `lineCost` is already zero for a fully owned row, whatever the pricing.
    lineCost: priceSource === 'none' && !fullyOwned ? null : material.lineCost,
  };
}

/**
 * The same cost line, but priced at what the material would cost to *buy* —
 * for the one consumer that has to compare against buying: `makeOrBuy`.
 *
 * A material the plan is building carries `unitPrice: null` (it isn't bought
 * at a unit price; its cost is the job that makes it). Fed straight into
 * `makeOrBuy` that reads as "no price to beat" and the verdict comes back
 * `null` — so the advice for a material vanished the moment a player acted on
 * it, and the row's tooltip fell back to naming the toggle's action with no
 * reasoning behind it. Which is backwards: whether building beats buying is
 * exactly the question a player wants answered while they are building.
 *
 * Returns the row untouched when it already has a price, so a bought row
 * costs nothing to pass through here.
 */
export function buyPricedLine(
  material: MaterialCostLine,
  sourcing: MaterialSourcingMap | undefined,
  materialPrices: HubPrices
): MaterialCostLine {
  if (material.unitPrice !== null) return material;
  const candidate = sourcing?.[material.typeID]?.overridePrice ?? materialPrices[material.typeID];
  // Range-checked here rather than trusted: this is the one path that reaches
  // past the engine's own pricing into the raw maps, and a NaN or a negative
  // would come back out of `makeOrBuy` as a confident verdict.
  const unitPrice =
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
      ? candidate
      : null;
  return unitPrice === null ? material : { ...material, unitPrice };
}

/** A material being built here rather than bought. */
export function isBuilt(material: MaterialTableRow): boolean {
  return material.subBuilds.length > 0;
}

/** What kind of price a row carries; `hub` is a plain market price, which the table leaves untagged. */
export type PriceTag = 'override' | 'hub' | 'owned' | 'unpriced';

/**
 * The price kind the table's Price cell announces. A built row has no
 * purchase price: it is `unpriced` only when something under it has none (a
 * warning about the plan's totals), else null.
 */
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

/** What building saves over buying, when the advice says building is cheaper and something is left to buy. */
export function buildSavings(
  material: Pick<MaterialCostLine, 'remainingQuantity'>,
  advice: MakeOrBuy | undefined
): number | null {
  return advice?.verdict === 'build' && advice.savings > 0 && material.remainingQuantity > 0
    ? advice.savings
    : null;
}

/** The walked-book price a row shows: none on a built row or one the pilot priced themselves. */
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
