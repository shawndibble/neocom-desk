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
    byBasis: {},
    ...overrides,
  } as unknown as MiningYieldRow;
}

const context: YieldOverviewCsvContext = {
  showRefining: true,
  systemNames: new Map([[30000142, 'Jita']]),
  systemSecurity: new Map([[30000142, 0.9]]),
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
      'miningTax.csvSecurity',
      'miningTax.overview.volumeColumn',
      'miningTax.csvVolumeUnknownFor',
      'miningTax.overview.rawSellValue',
      'miningTax.overview.refineValue',
      'miningTax.csvUnpricedOres',
      'miningTax.overview.oreBreakdownColumn',
      'miningTax.overview.unitsColumn',
      'miningTax.overview.pricingColumn',
    ]);
  });

  it('drops Refined value when refining is off, but always keeps Character', () => {
    const headers = yieldOverviewCsvColumns(t, { ...context, showRefining: false }).map(
      (c) => c.header
    );
    expect(headers).toContain('miningTax.characterColumn');
    expect(headers).not.toContain('miningTax.overview.refineValue');
  });

  it('exports security, every ore with its units, and no volume gap when all sizes are known', () => {
    const byHeader = Object.fromEntries(
      yieldOverviewCsvColumns(t, context).map((c) => [c.header, c.value(yieldRow())])
    );
    expect(byHeader['miningTax.csvSecurity']).toBe(0.9);
    expect(byHeader['miningTax.overview.oreBreakdownColumn']).toBe(
      'Veldspar × 1000; Scordite × 500'
    );
    expect(byHeader['miningTax.csvVolumeUnknownFor']).toBeNull();
  });

  it('names the ores whose volume is unknown, so a partial m3 is not read as complete', () => {
    const columns = yieldOverviewCsvColumns(t, {
      ...context,
      typeVolumes: new Map([[1230, 0.1]]),
    });
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c.value(yieldRow())]));
    expect(byHeader['miningTax.overview.volumeColumn']).toBeCloseTo(100);
    expect(byHeader['miningTax.csvVolumeUnknownFor']).toBe('Scordite');
  });

  it('blanks raw and refined value when no ore line was priced', () => {
    const row = yieldRow({
      valuation: {
        rawValue: 0,
        refineValue: 0,
        pricedAll: false,
        lines: [oreLine(1230, 10, 0, 0)],
      },
    } as unknown as Partial<MiningYieldRow>);
    const byHeader = Object.fromEntries(
      yieldOverviewCsvColumns(t, context).map((c) => [c.header, c.value(row)])
    );
    expect(byHeader['miningTax.overview.rawSellValue']).toBeNull();
    expect(byHeader['miningTax.overview.refineValue']).toBeNull();
  });

  it('names the unpriced ores of a partly priced row, so its values read as floors', () => {
    const row = yieldRow({
      valuation: {
        rawValue: 50,
        refineValue: 60,
        pricedAll: false,
        lines: [oreLine(1230, 10, 50, 60), oreLine(1228, 5, 0, 0)],
      },
    } as unknown as Partial<MiningYieldRow>);
    const byHeader = Object.fromEntries(
      yieldOverviewCsvColumns(t, context).map((c) => [c.header, c.value(row)])
    );
    expect(byHeader['miningTax.csvUnpricedOres']).toBe('Scordite');
    expect(byHeader['miningTax.overview.rawSellValue']).toBe(50);
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
    expect(byHeader['miningTax.overview.oreBreakdownColumn']).toBe(
      'Veldspar × 1000; Scordite × 500'
    );
    expect(byHeader['miningTax.overview.unitsColumn']).toBe(1500);
    expect(byHeader['miningTax.overview.pricingColumn']).toBe('miningTax.overview.pricingFull');
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
    expect(pricing.value(row)).toBe('miningTax.overview.pricingPartial');
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
      'miningTax.overview.detail.batchesColumn',
      'miningTax.overview.detail.leftOverColumn',
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
      null,
      null,
    ]);
    const csv = toCsv([oreLine(1230, 10, 0, 0)], columns);
    expect(csv.split('\r\n')[1]).toBe('"Veldspar",10,1,,,,');
  });

  it('exports whole batches and units left over, blank for a type with no reprocessing data', () => {
    const columns = yieldOreCsvColumns(t, typeNames, typeVolumes, true);
    const refinable = {
      ...oreLine(1230, 250, 1, 1),
      batches: 2,
      unitsLeftOver: 50,
    } as unknown as OreLineValuation;
    expect(columns.slice(-2).map((c) => c.value(refinable))).toEqual([2, 50]);
    expect(columns.slice(-2).map((c) => c.value(oreLine(1230, 250, 1, 1)))).toEqual([null, null]);
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
