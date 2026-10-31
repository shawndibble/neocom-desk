import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { rowVolume } from '@/engine/industry/materialVolume';
import {
  buildSavings,
  isBuilt,
  materialPriceTag,
  materialRowState,
  shownDepth,
  type PriceTag,
} from './materialRow';
import { materialErrand } from './materialErrands';
import { ERRAND_LABEL_KEY } from './materialsTableStyle';
import type { MaterialTableRow } from './subBuildPlan';

/** The words the table's Price cell uses; a plain hub price, which it leaves untagged, is named here. */
const PRICE_TAG_KEY: Record<PriceTag, string> = {
  override: 'industry.priceSourceOverride',
  hub: 'industry.csvPriceSourceHub',
  owned: 'industry.priceSourceOwned',
  unpriced: 'industry.unpriced',
};

/**
 * CSV columns for the materials list: what the table shows (quantity, Have,
 * To buy, price, volume, line total, section), plus the facts its rows carry
 * in tags and sub-lines (price source, build runs and savings, blueprint
 * tier, depth price). Price and tag rules come from `materialRow.ts`, the
 * same ones MaterialsTable renders, so a file cannot disagree with its table.
 *
 * The make-or-buy verdict exports as the one-word Build/Buy the row's marker
 * announces; the sub-job's own quote is left out as not actionable alone.
 *
 * A cell with nothing to say is blank, not a display string: a blank lets a
 * spreadsheet SUM() skip the row. A fully owned row costs zero, so it
 * exports a real 0.
 */
export function materialsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeID: number) => string,
  sourcing: MaterialSourcingMap | undefined,
  pricesReady: boolean,
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>,
  volumeFor?: (typeID: number) => number | null,
  depthFor?: (typeID: number) => DepthPrice | undefined
): CsvColumn<MaterialTableRow>[] {
  return [
    {
      header: t('industry.csvMaterial'),
      value: (material) => nameFor(material.typeID),
    },
    {
      header: t('industry.csvQuantity'),
      value: (material) => material.quantity,
    },
    {
      header: t('industry.csvUnitPriceIsk'),
      value: (material) => materialRowState(material, sourcing, pricesReady).unitPrice,
    },
    {
      header: t('industry.csvLineTotalIsk'),
      value: (material) => materialRowState(material, sourcing, pricesReady).lineCost,
    },
    {
      header: t('industry.csvMakeOrBuy'),
      value: (material) => {
        const advice = makeOrBuy?.get(material.typeID);
        return advice ? t(`industry.makeOrBuy.${advice.verdict}`) : null;
      },
    },
    {
      header: t('industry.errands.haveColumn'),
      // What the Have field shows: the typed quantity, which can exceed the need (the engine clamps its own).
      value: (material) =>
        material.acquisitionTier
          ? material.ownedQuantity
          : (sourcing?.[material.typeID]?.ownedQuantity ?? 0),
    },
    {
      // A built row is not bought at all.
      header: t('industry.errands.buyColumn'),
      value: (material) => (isBuilt(material) ? null : material.remainingQuantity),
    },
    {
      // Blank for a built row (its inputs carry the volume) and an unknown size.
      header: t('industry.volume'),
      value: (material) =>
        !volumeFor || isBuilt(material) ? null : rowVolume(material, volumeFor),
    },
    {
      header: t('industry.csvErrand'),
      value: (material) => t(ERRAND_LABEL_KEY[materialErrand(material)]),
    },
    {
      header: t('industry.csvSubBuildRuns'),
      value: (material) => {
        return isBuilt(material)
          ? material.subBuilds.reduce((sum, build) => sum + build.runs, 0)
          : null;
      },
    },
    {
      header: t('industry.csvPriceSource'),
      // The tag the table shows; a market price is still named, and all but a typed override wait for prices.
      value: (material) => {
        const tag = materialPriceTag(material, sourcing, pricesReady);
        if (tag === null || (tag !== 'override' && !isBuilt(material) && !pricesReady)) return null;
        return t(PRICE_TAG_KEY[tag]);
      },
    },
    {
      header: t('industry.csvBlueprintMe'),
      value: (material) => material.acquisitionTier?.me ?? null,
    },
    {
      header: t('industry.csvBlueprintTe'),
      value: (material) => material.acquisitionTier?.te ?? null,
    },
    {
      // Where the blueprint copy comes from, when it is not just bought.
      header: t('industry.csvBlueprintSource'),
      value: (material) => {
        const tier = material.acquisitionTier;
        if (!tier) return null;
        if (tier.community) return tier.community.memberName;
        return tier.invented ? t('industry.csvBlueprintInvented') : null;
      },
    },
    {
      header: t('industry.csvBlueprintSourceStale'),
      value: (material) => {
        const community = material.acquisitionTier?.community;
        return community ? exportFlag(t, community.stale) : null;
      },
    },
    {
      header: t('industry.csvDepthBest'),
      value: (material) => shownDepth(material, sourcing, depthFor)?.best ?? null,
    },
    {
      header: t('industry.csvDepthAvg'),
      value: (material) => shownDepth(material, sourcing, depthFor)?.avg ?? null,
    },
    {
      header: t('industry.csvDepthCovered'),
      value: (material) => exportFlag(t, shownDepth(material, sourcing, depthFor)?.covered),
    },
    {
      // What building saves over buying, on the rows the table words "saves X vs buying".
      header: t('industry.csvSavesVsBuying'),
      value: (material) =>
        isBuilt(material) ? buildSavings(material, makeOrBuy?.get(material.typeID)) : null,
    },
  ];
}
