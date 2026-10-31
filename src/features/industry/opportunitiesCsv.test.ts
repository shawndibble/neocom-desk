import { describe, expect, it } from 'vitest';
import { marketWideDayRow, opportunityRow } from './exportFixtures.testutil';
import type { OpportunityRow } from './opportunities';
import { marketWideOpportunitiesCsvColumns, opportunitiesCsvColumns } from './opportunitiesCsv';

const t = (k: string) => k;

function opportunity(runs: number, profit: number | null): OpportunityRow {
  const base = opportunityRow();
  return opportunityRow({
    candidate: { ...base.candidate, blueprint: { ...base.candidate.blueprint, runs } },
    result: {
      profit,
      totalCost: 100,
      revenue: 150,
      marginPct: profit === null ? null : 10,
      seconds: 7200,
      iskPerHour: profit,
      materials: [
        {
          typeID: 34,
          baseQuantity: 10,
          quantity: 10,
          ownedQuantity: 5,
          remainingQuantity: 5,
          unitPrice: 10,
          lineCost: 50,
          unpriced: false,
        },
      ],
    },
  });
}

describe('opportunitiesCsvColumns', () => {
  const columns = opportunitiesCsvColumns(t);

  it('orders columns as the table does, with the character and runs split out', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.product',
      'industry.csvCharacter',
      'industry.opportunitiesBlueprint',
      'industry.runs',
      'industry.opportunitiesUnitMargin',
      'industry.csvMarginPct',
      'industry.csvVs90dPct',
      'industry.opportunitiesStockCovers',
      'industry.opportunitiesStillToBuy',
      'industry.csvTimeSeconds',
      'industry.iskPerHour',
      'industry.opportunitiesOrderDepthLabel',
      'industry.csvProfit',
      'industry.csvTotalCost',
      'industry.csvRevenue',
      'industry.csvForgoneSale',
      'industry.csvSkillGated',
      'industry.csvMissingSkills',
      'industry.csvClosestCharacter',
    ]);
  });

  it('exports a BPC with its runs and per-unit margin raw', () => {
    expect(columns.map((c) => c.value(opportunity(5, 1000)))).toEqual([
      'Rifter',
      'Pilot One',
      'industry.bpc',
      5,
      200,
      10,
      null,
      50,
      50,
      7200,
      1000,
      'industry.opportunitiesOrderDepth.thin',
      1000,
      100,
      150,
      0,
      null,
      null,
      null,
    ]);
  });

  it('exports the loss-tooltip figures and the skill gate verdict', () => {
    const gated = opportunitiesCsvColumns(t, {
      verdictFor: () => ({
        gated: true,
        shortfall: [{ typeID: 3380, haveLevel: 2, needLevel: 4 }],
        bestCharacterId: 7,
      }),
      nameForSkill: () => 'Industry',
      nameForCharacter: () => 'Pilot Two',
    });
    const base = opportunity(5, -500);
    const row = {
      ...base,
      forgoneSale: 120,
      result: { ...base.result, totalCost: 900, revenue: 400 },
    };
    expect(gated.slice(12).map((c) => c.value(row))).toEqual([
      -500,
      900,
      400,
      120,
      'common.exportFlagYes',
      'Industry IV (industry.csvHaveLevel)',
      'Pilot Two',
    ]);
  });

  it('blanks Total cost while a material is unpriced, since it is only a floor', () => {
    const base = opportunity(5, null);
    const unpriced = { ...base, result: { ...base.result, unpriceable: true } };
    expect(columns[13].value(unpriced)).toBeNull();
    expect(columns[13].value(base)).toBe(100);
  });

  it('leaves a BPO runs cell and unpriced figures blank', () => {
    const values = columns.map((c) => c.value(opportunity(-1, null)));
    expect(values[2]).toBe('industry.bpo');
    expect(values[3]).toBeNull();
    expect(values[4]).toBeNull();
    expect(values[5]).toBeNull();
    expect(values[6]).toBeNull();
    expect(values[10]).toBeNull();
  });
});

describe('marketWideOpportunitiesCsvColumns', () => {
  const columns = marketWideOpportunitiesCsvColumns(t);
  const row = marketWideDayRow();

  it('orders columns as the table does', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.product',
      'industry.marketOpportunitiesBlueprintSource',
      'industry.csvMarginPct',
      'industry.csvVs90dPct',
      'industry.csvTimeSeconds',
      'industry.iskPerHour',
      'industry.iskPerDay',
      'industry.buildCost',
      'industry.opportunitiesOrderDepthLabel',
      'industry.csvPriceCapped',
      'industry.csvSkillGated',
      'industry.csvMissingSkills',
      'industry.csvClosestCharacter',
    ]);
  });

  it('exports raw figures and translated labels', () => {
    expect(columns.map((c) => c.value(row))).toEqual([
      'Rifter',
      'industry.marketOpportunitiesBlueprintSources.market',
      62.5,
      35,
      3600,
      null,
      48_000,
      1_500_000,
      'industry.opportunitiesOrderDepth.deep',
      'common.exportFlagNo',
      null,
      null,
      null,
    ]);
  });
});
