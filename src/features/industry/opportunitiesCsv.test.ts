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
      marginPct: profit === null ? null : 10,
      seconds: 7200,
      iskPerHour: profit,
      materials: [{ ownedQuantity: 5, remainingQuantity: 5, unitPrice: 10, lineCost: 50 }],
    },
    orderDepth: 'thin',
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
      'industry.opportunitiesStockCovers',
      'industry.opportunitiesStillToBuy',
      'industry.csvTimeSeconds',
      'industry.iskPerHour',
      'industry.opportunitiesOrderDepthLabel',
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
      50,
      50,
      7200,
      1000,
      'industry.opportunitiesOrderDepth.thin',
    ]);
  });

  it('leaves a BPO runs cell and unpriced figures blank', () => {
    const values = columns.map((c) => c.value(opportunity(-1, null)));
    expect(values[2]).toBe('industry.bpo');
    expect(values[3]).toBeNull();
    expect(values[4]).toBeNull();
    expect(values[5]).toBeNull();
    expect(values[9]).toBeNull();
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
    buildCost: 1_500_000,
    orderDepth: 'deep',
  } as unknown as MarketWideDayRow;

  it('orders columns as the table does', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.product',
      'industry.marketOpportunitiesBlueprintSource',
      'industry.csvMarginPct',
      'industry.csvTimeSeconds',
      'industry.iskPerHour',
      'industry.iskPerDay',
      'industry.buildCost',
      'industry.opportunitiesOrderDepthLabel',
    ]);
  });

  it('exports raw figures and translated labels', () => {
    expect(columns.map((c) => c.value(row))).toEqual([
      'Rifter',
      'industry.marketOpportunitiesBlueprintSources.market',
      62.5,
      3600,
      null,
      48_000,
      1_500_000,
      'industry.opportunitiesOrderDepth.deep',
    ]);
  });
});
