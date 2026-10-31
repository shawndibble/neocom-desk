import { describe, expect, it } from 'vitest';
import type { MarketWideDayRow } from './marketWideOpportunities';
import type { OpportunityRow } from './opportunities';
import { marketWideOpportunitiesCsvColumns, opportunitiesCsvColumns } from './opportunitiesCsv';

const t = (k: string) => k;

function opportunity(runs: number, profit: number | null): OpportunityRow {
  return {
    candidate: {
      id: '1:1',
      characterId: 1,
      characterName: 'Pilot One',
      blueprint: { runs },
      catalogEntry: { productName: 'Rifter', blueprint: { products: [{ quantity: 1 }] } },
    },
    result: {
      profit,
      totalCost: 100,
      revenue: 150,
      marginPct: profit === null ? null : 10,
      seconds: 7200,
      iskPerHour: profit,
      materials: [{ ownedQuantity: 5, remainingQuantity: 5, unitPrice: 10, lineCost: 50 }],
    },
    orderDepth: 'thin',
    forgoneSale: 0,
  } as unknown as OpportunityRow;
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
    const row = opportunity(5, -500) as unknown as {
      result: Record<string, unknown>;
      forgoneSale: number;
    };
    row.result.totalCost = 900;
    row.result.revenue = 400;
    row.forgoneSale = 120;
    row.result.profit = -500;
    expect(gated.slice(12).map((c) => c.value(row as unknown as OpportunityRow))).toEqual([
      -500,
      900,
      400,
      120,
      'industry.csvYes',
      'Industry IV (industry.csvHaveLevel)',
      'Pilot Two',
    ]);
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
  const row = {
    productTypeID: 587,
    productName: 'Rifter',
    blueprintSource: 'market',
    marginPct: 62.5,
    seconds: 3600,
    iskPerHour: null,
    iskPerDay: 48_000,
    vs90d: 35.4,
    buildCost: 1_500_000,
    orderDepth: 'deep',
  } as unknown as MarketWideDayRow;

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
      'industry.csvNo',
      null,
      null,
      null,
    ]);
  });
});
