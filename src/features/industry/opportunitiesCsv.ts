import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { MarketWideDayRow } from './marketWideOpportunities';
import type { OpportunityRow } from './opportunities';
import { stockCoverage, unitMargin } from './opportunityMetrics';
import { romanLevel } from '@/engine/projection';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';

/*
 * Export columns for the two opportunity rankings, in each table's order.
 * Time is raw seconds and margin a raw percent (`62.5` for the table's
 * `62.5%`); unpriced figures are blank, never "Unknown".
 */

/** The table's whole percent ("+35%" exports `35`); blank while unread or too thin to say. */
function vs90dCsv(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value);
}

/** What the skill-gate columns resolve a row's verdict and names through. */
export interface SkillGateExport {
  /** The row's account-wide verdict; undefined while unread (exports blank, never "no"). */
  verdictFor: (productTypeID: number | null) => SkillGateVerdict | undefined;
  nameForSkill: (typeID: number) => string;
  nameForCharacter: (characterId: number) => string;
}

/** The three skill-gate columns every opportunity table carries: gated, what is missing, and who is closest. */
function skillGateColumns<R>(
  t: CsvTranslate,
  productTypeIdOf: (row: R) => number | null,
  gate: SkillGateExport | undefined
): CsvColumn<R>[] {
  const verdictOf = (row: R) => gate?.verdictFor(productTypeIdOf(row));
  return [
    {
      header: t('industry.csvSkillGated'),
      value: (row) => {
        const verdict = verdictOf(row);
        return verdict ? (verdict.gated ? t('industry.csvYes') : t('industry.csvNo')) : null;
      },
    },
    {
      header: t('industry.csvMissingSkills'),
      value: (row) => {
        const verdict = verdictOf(row);
        if (!gate || !verdict?.gated) return null;
        return verdict.shortfall
          .map(
            (s) =>
              `${gate.nameForSkill(s.typeID)} ${romanLevel(s.needLevel)} (${t('industry.csvHaveLevel', { level: s.haveLevel })})`
          )
          .join('; ');
      },
    },
    {
      header: t('industry.csvClosestCharacter'),
      value: (row) => {
        const verdict = verdictOf(row);
        return gate && verdict?.gated ? gate.nameForCharacter(verdict.bestCharacterId) : null;
      },
    },
  ];
}

/** Build Opportunities (owned blueprints). The character and runs, chips in the table, get their own columns. */
export function opportunitiesCsvColumns(
  t: CsvTranslate,
  gate?: SkillGateExport
): CsvColumn<OpportunityRow>[] {
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
    { header: t('industry.csvVs90dPct'), value: (row) => vs90dCsv(row.vs90d) },
    {
      header: t('industry.opportunitiesStockCovers'),
      value: (row) => stockCoverage(row)?.coveredPct ?? null,
    },
    {
      header: t('industry.opportunitiesStillToBuy'),
      value: (row) => stockCoverage(row)?.stillToBuyIsk ?? null,
    },
    { header: t('industry.csvTimeSeconds'), value: (row) => row.result.seconds },
    { header: t('industry.iskPerHour'), value: (row) => row.result.iskPerHour },
    {
      header: t('industry.opportunitiesOrderDepthLabel'),
      value: (row) => t(`industry.opportunitiesOrderDepth.${row.orderDepth}`),
    },
    // The loss tooltip's figures, for every row (the tooltip only opens on a loss).
    { header: t('industry.csvProfit'), value: (row) => row.result.profit },
    { header: t('industry.csvTotalCost'), value: (row) => row.result.totalCost },
    { header: t('industry.csvRevenue'), value: (row) => row.result.revenue },
    { header: t('industry.csvForgoneSale'), value: (row) => row.forgoneSale },
    ...skillGateColumns<OpportunityRow>(t, (row) => row.candidate.catalogEntry.productTypeID, gate),
  ];
}

/** "What's profitable" (the market-wide scan). */
export function marketWideOpportunitiesCsvColumns(
  t: CsvTranslate,
  gate?: SkillGateExport
): CsvColumn<MarketWideDayRow>[] {
  return [
    { header: t('industry.product'), value: (row) => row.productName },
    {
      header: t('industry.marketOpportunitiesBlueprintSource'),
      value: (row) => t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`),
    },
    { header: t('industry.csvMarginPct'), value: (row) => row.marginPct },
    { header: t('industry.csvVs90dPct'), value: (row) => vs90dCsv(row.vs90d) },
    { header: t('industry.csvTimeSeconds'), value: (row) => row.seconds },
    { header: t('industry.iskPerHour'), value: (row) => row.iskPerHour },
    { header: t('industry.iskPerDay'), value: (row) => row.iskPerDay },
    { header: t('industry.buildCost'), value: (row) => row.buildCost },
    {
      header: t('industry.opportunitiesOrderDepthLabel'),
      value: (row) => t(`industry.opportunitiesOrderDepth.${row.orderDepth}`),
    },
    {
      header: t('industry.csvPriceCapped'),
      value: (row) => (row.priceCapped ? t('industry.csvYes') : t('industry.csvNo')),
    },
    ...skillGateColumns<MarketWideDayRow>(t, (row) => row.productTypeID, gate),
  ];
}
