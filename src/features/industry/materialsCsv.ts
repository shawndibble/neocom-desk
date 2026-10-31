import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import { rowVolume } from '@/engine/industry/materialVolume';
import { materialRowState } from './materialRow';
import { materialErrand } from './materialErrands';
import { ERRAND_LABEL_KEY } from './materialsTableStyle';
import type { MaterialTableRow } from './subBuildPlan';

/** A materials row as the table holds it; `subBuilds` is absent on a plain cost line (bought). */
export type MaterialCsvRow = MaterialCostLine & {
  subBuilds?: MaterialTableRow['subBuilds'];
};

const asTableRow = (row: MaterialCsvRow): MaterialTableRow => ({
  ...row,
  subBuilds: row.subBuilds ?? [],
});

/**
 * CSV columns for the materials list: name, effective (post-ME) quantity,
 * unit price, line total. The price columns come from `materialRowState`, the
 * same decision MaterialsTable renders, so an export can't disagree with the
 * table it was taken from — an override price exports as the unit price, and
 * an owned portion is already out of the line total.
 *
 * The make-or-buy verdict exports as the same one-word Build/Buy the row's
 * marker announces, so a materials list taken into a spreadsheet still says
 * which lines are worth producing. Only the verdict, not the quote behind it:
 * the sub-job's own cost is not actionable without the rest of that job.
 *
 * A cell with nothing to say is blank (not a display string like "No price"):
 * a blank lets a spreadsheet SUM() skip the row, a string would poison the
 * column into text. A fully owned row is the exception — it costs zero whether
 * or not anything is priced, so it exports a real 0.
 */
export function materialsCsvColumns(
  t: CsvTranslate,
  nameFor: (typeID: number) => string,
  sourcing: MaterialSourcingMap | undefined,
  pricesReady: boolean,
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>,
  volumeFor?: (typeID: number) => number | null
): CsvColumn<MaterialCsvRow>[] {
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
      value: (material) => material.ownedQuantity,
    },
    {
      // A built row is not bought at all.
      header: t('industry.errands.buyColumn'),
      value: (material) =>
        (material.subBuilds?.length ?? 0) > 0 ? null : material.remainingQuantity,
    },
    {
      // Blank for a built row (its inputs carry the volume) and an unknown size.
      header: t('industry.volume'),
      value: (material) =>
        !volumeFor || (material.subBuilds?.length ?? 0) > 0 ? null : rowVolume(material, volumeFor),
    },
    {
      header: t('industry.csvErrand'),
      value: (material) => t(ERRAND_LABEL_KEY[materialErrand(asTableRow(material))]),
    },
    {
      header: t('industry.csvSubBuildRuns'),
      value: (material) => {
        const builds = material.subBuilds ?? [];
        return builds.length === 0 ? null : builds.reduce((sum, build) => sum + build.runs, 0);
      },
    },
    {
      header: t('industry.csvPriceSource'),
      value: (material) => {
        if ((material.subBuilds?.length ?? 0) > 0) return null;
        const state = materialRowState(material, sourcing, pricesReady);
        if (state.priceSource === 'override') return t('industry.csvPriceSources.override');
        if (state.fullyOwned) return t('industry.csvPriceSources.owned');
        return t(`industry.csvPriceSources.${state.priceSource === 'hub' ? 'hub' : 'unpriced'}`);
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
  ];
}
