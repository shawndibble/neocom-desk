import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import { joined } from '@/lib/exportSheets';
import type { MarketWideDayRow } from './marketWideOpportunities';
import type { OpportunityRow } from './opportunities';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import { blueprintKindKey, stockCoverage, unitMargin } from './opportunityMetrics';
import { romanLevel } from '@/engine/projection';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';

function vs90dCsv(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value);
}

export interface SkillGateExport {
  verdictFor: (productTypeID: number | null) => SkillGateVerdict | undefined;
  nameForSkill: (typeID: number) => string;
  nameForCharacter: (characterId: number) => string;
}

export function skillGateExport(
  verdicts: ReadonlyMap<number, SkillGateVerdict>,
  catalog: BlueprintCatalog | null,
  characterNames: ReadonlyMap<number, string>
): SkillGateExport {
  return {
    verdictFor: (productTypeID) =>
      productTypeID === null ? undefined : verdicts.get(productTypeID),
    nameForSkill: (typeID) => (catalog ? nameForType(catalog, typeID) : `#${typeID}`),
    nameForCharacter: (id) => characterNames.get(id) ?? `#${id}`,
  };
}

function skillGateColumns<R>(
  t: CsvTranslate,
  productTypeIdOf: (row: R) => number | null,
  gate: SkillGateExport | undefined
): CsvColumn<R>[] {
  const verdictOf = (row: R) => gate?.verdictFor(productTypeIdOf(row));
  return [
    {
      header: t('industry.csvSkillGated'),
      value: (row) => exportFlag(t, verdictOf(row)?.gated),
    },
    {
      header: t('industry.csvMissingSkills'),
      value: (row) => {
        const verdict = verdictOf(row);
        if (!gate || !verdict?.gated) return null;
        return joined(
          verdict.shortfall.map(
            (s) =>
              `${gate.nameForSkill(s.typeID)} ${romanLevel(s.needLevel)} (${t('industry.csvHaveLevel', { level: romanLevel(s.haveLevel) })})`
          )
        );
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

export function opportunitiesCsvColumns(
  t: CsvTranslate,
  gate?: SkillGateExport
): CsvColumn<OpportunityRow>[] {
  return [
    { header: t('industry.product'), value: (row) => row.candidate.catalogEntry.productName },
    { header: t('industry.csvCharacter'), value: (row) => row.candidate.characterName },
    {
      header: t('industry.opportunitiesBlueprint'),
      value: (row) => t(blueprintKindKey(row.candidate)),
    },
    {
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
    { header: t('industry.csvProfit'), value: (row) => row.result.profit },
    {
      header: t('industry.csvTotalCost'),
      value: (row) => (row.result.unpriceable ? null : row.result.totalCost),
    },
    { header: t('industry.csvRevenue'), value: (row) => row.result.revenue },
    { header: t('industry.csvForgoneSale'), value: (row) => row.forgoneSale },
    { header: t('industry.csvPriceCapped'), value: (row) => exportFlag(t, row.priceCapped) },
    ...skillGateColumns<OpportunityRow>(t, (row) => row.candidate.catalogEntry.productTypeID, gate),
  ];
}

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
      value: (row) => exportFlag(t, row.priceCapped),
    },
    ...skillGateColumns<MarketWideDayRow>(t, (row) => row.productTypeID, gate),
  ];
}
