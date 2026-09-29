import { describe, expect, it } from 'vitest';
import type { PlanRow, SensitivityRow } from './planModel';
import { planChainCsvColumns, planSensitivityCsvColumns } from './planResultsCsv';

const t = (k: string, options?: Record<string, unknown>) =>
  options ? `${k}:${JSON.stringify(options)}` : k;

describe('planChainCsvColumns', () => {
  const columns = planChainCsvColumns(t);
  const row: PlanRow = {
    typeId: 2393,
    name: 'Bacteria',
    tier: 1,
    unitsPerHour: 42.5,
    factoryPins: 3,
    unitPrice: 312.4,
    role: 'make',
    valueAddPerHour: -1250.5,
    read: 'buy',
  };

  it('orders columns as the chain table does, the read split from the role', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'piPlan.column.commodity',
      'piPlan.column.tier',
      'piPlan.column.needPerHour',
      'piPlan.column.pins',
      'piPlan.column.unitPrice',
      'piPlan.column.read',
      'piPlan.csvHubRead',
      'piPlan.column.valueAdd',
    ]);
  });

  it('exports raw figures and translated labels', () => {
    expect(columns.map((c) => c.value(row))).toEqual([
      'Bacteria',
      'piPlan.tierChip:{"tier":1}',
      42.5,
      3,
      312.4,
      'piPlan.roleMake',
      'piPlan.readBuy',
      -1250.5,
    ]);
  });

  it('blanks what the table shows as "—", and names an unknown read', () => {
    const p0 = {
      ...row,
      tier: 0 as const,
      factoryPins: null,
      unitPrice: null,
      valueAddPerHour: null,
      read: null,
    };
    const values = columns.map((c) => c.value(p0));
    expect(values[3]).toBeNull();
    expect(values[4]).toBeNull();
    expect(values[6]).toBe('piPlan.readUnknown');
    expect(values[7]).toBeNull();
  });
});

describe('planSensitivityCsvColumns', () => {
  const columns = planSensitivityCsvColumns(t, [0.05, 0.1], (rate) => `${rate * 100}%`);
  const row: SensitivityRow = {
    floor: 'P0',
    factoryPins: 12,
    planetCount: 2,
    extractors: 4,
    cells: [
      { rate: 0.05, status: 'costed', margin: 1_000_000, best: true },
      { rate: 0.1, status: 'needs-extraction-rate', best: false },
    ],
  };

  it('has floor, pins, extractors, then one column per customs rate', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'piPlan.floorColumn',
      'piPlan.column.pins',
      'piPlan.csvExtractors',
      'piPlan.rateColumn:{"percent":"5%"}',
      'piPlan.rateColumn:{"percent":"10%"}',
    ]);
  });

  it('exports each costed margin raw and an uncosted cell blank', () => {
    expect(columns.map((c) => c.value(row))).toEqual([
      'piPlan.floorOption.P0',
      12,
      4,
      1_000_000,
      null,
    ]);
  });

  it('leaves extractors blank off the P0 floor', () => {
    expect(columns[2].value({ ...row, floor: 'P1', extractors: null })).toBeNull();
  });
});
