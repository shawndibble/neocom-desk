import { describe, it, expect } from 'vitest';
import type { StockRow } from '@/engine/stockTargets/stockRows';
import { stockCsvColumns } from './stockCsv';

const t = (k: string) => k;

function row(overrides: Partial<StockRow> = {}): StockRow {
  return {
    typeId: 34,
    target: 100,
    listed: 40,
    inHangar: 20,
    price: 5,
    listedBy: [
      { characterId: 1, quantity: 30 },
      { characterId: 2, quantity: 10 },
    ],
    inHangarBy: [{ characterId: 1, quantity: 20 }],
    shortfall: 60,
    fromHangar: 20,
    toSource: 40,
    fill: 0.4,
    status: 'low',
    costToFill: 200,
    ...overrides,
  };
}

function columns(characterName?: (id: number) => string) {
  return stockCsvColumns(t, {
    nameOf: () => 'Tritanium',
    groupOf: () => 'Minerals',
    characterName,
  });
}
const valuesOf = (r: StockRow, characterName?: (id: number) => string) =>
  Object.fromEntries(columns(characterName).map((c) => [c.header, c.value(r)]));

describe('stockCsvColumns', () => {
  it('orders item, group, target, listed, in hangar, fill, restock halves, price, cost, status', () => {
    expect(columns().map((c) => c.header)).toEqual([
      'stockTargets.table.item',
      'stockTargets.table.csvGroup',
      'stockTargets.table.target',
      'stockTargets.table.listed',
      'stockTargets.table.csvListedBy',
      'stockTargets.table.inHangar',
      'stockTargets.table.csvInHangarBy',
      'stockTargets.table.fill',
      'stockTargets.table.csvFromHangar',
      'stockTargets.table.csvToSource',
      'stockTargets.table.csvUnitPrice',
      'stockTargets.table.costToFill',
      'stockTargets.table.status',
    ]);
  });

  it('exports every number raw and the status as its word', () => {
    expect(valuesOf(row())).toMatchObject({
      'stockTargets.table.item': 'Tritanium',
      'stockTargets.table.csvGroup': 'Minerals',
      'stockTargets.table.target': 100,
      'stockTargets.table.listed': 40,
      'stockTargets.table.inHangar': 20,
      'stockTargets.table.fill': 0.4,
      'stockTargets.table.csvFromHangar': 20,
      'stockTargets.table.csvToSource': 40,
      'stockTargets.table.csvUnitPrice': 5,
      'stockTargets.table.costToFill': 200,
      'stockTargets.table.status': 'stockTargets.status.low',
    });
  });

  it('names who holds each count only when more than one Character has data', () => {
    const named = valuesOf(row(), (id) => `Pilot ${id}`);
    expect(named['stockTargets.table.csvListedBy']).toBe('Pilot 1: 30; Pilot 2: 10');
    expect(named['stockTargets.table.csvInHangarBy']).toBe('Pilot 1: 20');
    expect(valuesOf(row())['stockTargets.table.csvListedBy']).toBeUndefined();
  });

  it('leaves cost blank for an unpriced item, not 0', () => {
    expect(valuesOf(row({ price: null, costToFill: null }))).toMatchObject({
      'stockTargets.table.csvUnitPrice': null,
      'stockTargets.table.costToFill': null,
    });
  });
});
