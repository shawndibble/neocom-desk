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

const PRICE_TAG_KEY: Record<PriceTag, string> = {
  override: 'industry.priceSourceOverride',
  hub: 'industry.csvPriceSourceHub',
  owned: 'industry.priceSourceOwned',
  unpriced: 'industry.unpriced',
};

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
      value: (material) =>
        material.acquisitionTier
          ? material.ownedQuantity
          : (sourcing?.[material.typeID]?.ownedQuantity ?? 0),
    },
    {
      header: t('industry.errands.buyColumn'),
      value: (material) => (isBuilt(material) ? null : material.remainingQuantity),
    },
    {
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
      header: t('industry.csvBlueprintSource'),
      value: (material) => {
        const tier = material.acquisitionTier;
        if (!tier) return null;
        if (tier.community) return tier.community.memberName;
        if (tier.copyOnly) return t('industry.csvBlueprintCopyOnly');
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
      header: t('industry.csvSavesVsBuying'),
      value: (material) =>
        isBuilt(material) ? buildSavings(material, makeOrBuy?.get(material.typeID)) : null,
    },
  ];
}
