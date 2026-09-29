import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { OreLineValuation } from '@/engine/miningTax/yieldValuation';
import type { MiningYieldRow } from './yieldSnapshot';
import {
  yieldOreCsvColumns,
  yieldOverviewCsvColumns,
  yieldRefinesCsvColumns,
  type YieldOverviewCsvContext,
} from './yieldCsv';

const t = (k: string) => k;

function oreLine(typeId: number, quantity: number, rawValue: number, refineValue: number) {
  return {
    typeId,
    quantity,
    rawValue,
    refineValue,
    refineOutputs: [],
    batches: 0,
    unitsLeftOver: 0,
  } as unknown as OreLineValuation;
}

function yieldRow(overrides: Partial<MiningYieldRow> = {}): MiningYieldRow {
  return {
    characterId: 1,
    characterName: 'Miner One',
    entry: {
      characterId: 1,
      date: '2026-09-04',
      solarSystemId: 30000142,
      oreLines: [
        { typeId: 1230, quantity: 1000 },
        { typeId: 1228, quantity: 500 },
      ],
    },
    valuation: {
      rawValue: 123456.5,
      refineValue: 150000,
      pricedAll: true,
      lines: [],
    },
    materialUnitPrices: new Map(),
    priceSource: 'saved',
    byBasis: {},
    ...overrides,
  } as unknown as MiningYieldRow;
}

const context: YieldOverviewCsvContext = {
  showCharacter: true,
  showRefining: true,
  systemNames: new Map([[30000142, 'Jita']]),
  typeNames: new Map([
    [1230, 'Veldspar'],
    [1228, 'Scordite'],
  ]),
  typeVolumes: new Map([
    [1230, 0.1],
    [1228, 0.15],
  ]),
};

describe('yieldOverviewCsvColumns', () => {
  it('exports every data column, not the picker selection, with the table header keys', () => {
    expect(yieldOverviewCsvColumns(t, context).map((c) => c.header)).toEqual([
      'miningTax.dateColumn',
      'miningTax.characterColumn',
      'miningTax.systemColumn',
      'miningTax.overview.volumeColumn',
      'miningTax.overview.rawSellValue',
      'miningTax.overview.refineValue',
      'miningTax.overview.oreBreakdownColumn',
      'miningTax.overview.unitsColumn',
      'miningTax.overview.pricingColumn',
    ]);
  });

  it('drops Character and Refined value when the table would not offer them', () => {
    const headers = yieldOverviewCsvColumns(t, {
      ...context,
      showCharacter: false,
      showRefining: false,
    }).map((c) => c.header);
    expect(headers).not.toContain('miningTax.characterColumn');
    expect(headers).not.toContain('miningTax.overview.refineValue');
  });

  it('exports raw numbers for volume, values and units', () => {
    const byHeader = Object.fromEntries(
      yieldOverviewCsvColumns(t, context).map((c) => [c.header, c.value(yieldRow())])
    );
    expect(byHeader['miningTax.dateColumn']).toBe('2026-09-04');
    expect(byHeader['miningTax.characterColumn']).toBe('Miner One');
    expect(byHeader['miningTax.systemColumn']).toBe('Jita');
    expect(byHeader['miningTax.overview.volumeColumn']).toBeCloseTo(175);
    expect(byHeader['miningTax.overview.rawSellValue']).toBe(123456.5);
    expect(byHeader['miningTax.overview.refineValue']).toBe(150000);
    expect(byHeader['miningTax.overview.oreBreakdownColumn']).toBe('Veldspar, Scordite');
    expect(byHeader['miningTax.overview.unitsColumn']).toBe(1500);
    expect(byHeader['miningTax.overview.pricingColumn']).toBe(
      'miningTax.overview.priceSource.saved'
    );
  });

  it('leaves volume blank when no type in the row has a known volume', () => {
    const volume = yieldOverviewCsvColumns(t, { ...context, typeVolumes: new Map() }).find(
      (c) => c.header === 'miningTax.overview.volumeColumn'
    )!;
    expect(volume.value(yieldRow())).toBeNull();
  });

  it('marks partial pricing in the pricing cell', () => {
    const pricing = yieldOverviewCsvColumns(t, context).find(
      (c) => c.header === 'miningTax.overview.pricingColumn'
    )!;
    const row = yieldRow({
      valuation: { rawValue: 1, refineValue: 1, pricedAll: false, lines: [] },
    } as unknown as Partial<MiningYieldRow>);
    expect(pricing.value(row)).toBe(
      'miningTax.overview.priceSource.saved (miningTax.overview.pricingPartial)'
    );
  });

  it('falls back to the system id for an unresolved system', () => {
    const system = yieldOverviewCsvColumns(t, { ...context, systemNames: new Map() }).find(
      (c) => c.header === 'miningTax.systemColumn'
    )!;
    expect(system.value(yieldRow())).toBe('#30000142');
  });
});

describe('yieldOreCsvColumns', () => {
  const typeNames = new Map([[1230, 'Veldspar']]);
  const typeVolumes = new Map([[1230, 0.1]]);

  it('orders ore, units, m³, raw, refined with the table header keys', () => {
    expect(yieldOreCsvColumns(t, typeNames, typeVolumes, true).map((c) => c.header)).toEqual([
      'miningTax.oreColumn',
      'miningTax.overview.detail.unitsColumn',
      'miningTax.overview.detail.m3Column',
      'miningTax.overview.rawSellValue',
      'miningTax.overview.refineValue',
    ]);
    expect(yieldOreCsvColumns(t, typeNames, typeVolumes, false).map((c) => c.header)).not.toContain(
      'miningTax.overview.refineValue'
    );
  });

  it('exports raw numbers, and blanks an unpriced value rather than a zero', () => {
    const columns = yieldOreCsvColumns(t, typeNames, typeVolumes, true);
    expect(columns.map((c) => c.value(oreLine(1230, 1000, 5000, 0)))).toEqual([
      'Veldspar',
      1000,
      100,
      5000,
      null,
    ]);
    const csv = toCsv([oreLine(1230, 10, 0, 0)], columns);
    expect(csv.split('\r\n')[1]).toBe('"Veldspar",10,1,,');
  });

  it('blanks m³ for a type with no known volume', () => {
    const columns = yieldOreCsvColumns(t, typeNames, new Map(), true);
    expect(columns[2].value(oreLine(1230, 10, 1, 1))).toBeNull();
    expect(columns[0].value(oreLine(999, 10, 1, 1))).toBe('#999');
  });
});

describe('yieldRefinesCsvColumns', () => {
  it('exports material, units and value, blanking an unpriced value', () => {
    const columns = yieldRefinesCsvColumns(t, new Map([[34, 'Tritanium']]));
    expect(columns.map((c) => c.header)).toEqual([
      'miningTax.overview.detail.materialColumn',
      'miningTax.overview.detail.unitsColumn',
      'miningTax.overview.detail.valueColumn',
    ]);
    expect(columns.map((c) => c.value({ typeId: 34, quantity: 400, value: 1600 }))).toEqual([
      'Tritanium',
      400,
      1600,
    ]);
    expect(columns[2].value({ typeId: 34, quantity: 400, value: null })).toBeNull();
  });
});
