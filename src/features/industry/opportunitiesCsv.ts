import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketWideDayRow } from './marketWideOpportunities';
import type { OpportunityRow } from './opportunities';
import { unitMargin } from './opportunityMetrics';

/*
 * Export columns for the two opportunity rankings, in each table's order.
 * Time is raw seconds and margin a raw percent (`62.5` for the table's
 * `62.5%`); unpriced figures are blank, never "Unknown".
 */

/** Build Opportunities (owned blueprints). The character and runs, chips in the table, get their own columns. */
export function opportunitiesCsvColumns(t: CsvTranslate): CsvColumn<OpportunityRow>[] {
  return [
    { header: t('industry.product'), value: (row) => row.candidate.catalogEntry.productName },
    { header: t('industry.csvCharacter'), value: (row) => row.candidate.characterName },
    {
      header: t('industry.opportunitiesBlueprint'),
      value: (row) => (row.candidate.blueprint.runs === -1 ? t('industry.bpo') : t('industry.bpc')),
    },
    {
      // A BPO's -1 is "unlimited", not a count.
      header: t('industry.runs'),
      value: (row) => (row.candidate.blueprint.runs === -1 ? null : row.candidate.blueprint.runs),
    },
    { header: t('industry.opportunitiesUnitMargin'), value: (row) => unitMargin(row) },
    { header: t('industry.csvMarginPct'), value: (row) => row.result.marginPct },
    { header: t('industry.csvTimeSeconds'), value: (row) => row.result.seconds },
    { header: t('industry.iskPerHour'), value: (row) => row.result.iskPerHour },
    {
      header: t('industry.opportunitiesOrderDepthLabel'),
      value: (row) => t(`industry.opportunitiesOrderDepth.${row.orderDepth}`),
    },
  ];
}

/** "What's profitable" (the market-wide scan). */
export function marketWideOpportunitiesCsvColumns(t: CsvTranslate): CsvColumn<MarketWideDayRow>[] {
  return [
    { header: t('industry.product'), value: (row) => row.productName },
    {
      header: t('industry.marketOpportunitiesBlueprintSource'),
      value: (row) => t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`),
    },
    { header: t('industry.csvMarginPct'), value: (row) => row.marginPct },
    { header: t('industry.csvTimeSeconds'), value: (row) => row.seconds },
    { header: t('industry.iskPerHour'), value: (row) => row.iskPerHour },
    { header: t('industry.iskPerDay'), value: (row) => row.iskPerDay },
    { header: t('industry.buildCost'), value: (row) => row.buildCost },
    {
      header: t('industry.opportunitiesOrderDepthLabel'),
      value: (row) => t(`industry.opportunitiesOrderDepth.${row.orderDepth}`),
    },
  ];
}
