import { describe, expect, it } from 'vitest';
import type { LedgerLabels, LocationRow } from './assetLedgerView';
import { corpAssetItemCsvColumns, corpAssetLocationCsvColumns } from './corpAssetsCsv';
import type { ItemTableRow } from './CorpAssetItemTable';

const t = (k: string) => k;
const labels = {
  typeName: (id: number) => `Type ${id}`,
  placeName: (id: number) => `Place ${id}`,
  shortPlaceName: (id: number | null) => (id === null ? null : `P${id}`),
  stateLabel: (state: string) => state,
  divisionName: (n: number) => `Div ${n}`,
} as unknown as LedgerLabels;

function stack(itemId: number, quantity: number, isSingleton: boolean | null) {
  return {
    itemId,
    typeId: 7,
    isBlueprintCopy: false,
    quantity,
    estimatedValue: 1,
    volume: null,
    isSingleton,
    state: 'offices',
    locationId: 1,
    division: 2,
    path: [],
  };
}

const item = {
  key: 'k',
  name: 'Rifter',
  categoryName: 'Ship',
  ledger: {
    typeId: 7,
    isBlueprintCopy: false,
    quantity: 5,
    estimatedValue: 100,
    volume: 10,
    placements: [{ state: 'offices', locationId: 1, division: 2, quantity: 5 }],
    stacks: [stack(11, 3, true), stack(12, 2, false), stack(13, 1, null)],
    stock: { target: 10, shortBy: 5, status: 'none-owned' },
  },
} as unknown as ItemTableRow;

describe('corpAssetItemCsvColumns', () => {
  const columns = corpAssetItemCsvColumns(t, {
    labels,
    assetNames: { 11: 'My Rifter' },
    blueprintTypeIds: new Set([7]),
  });
  const byHeader = (row: ItemTableRow) =>
    Object.fromEntries(columns.map((c) => [c.header, c.value(row)]));

  it('keeps one row per type and lists every stack with its path, quantity and state', () => {
    const stacks = byHeader(item)['corp.assets.csv.stacks'] as string;
    expect(stacks.split('; ')).toEqual([
      'My Rifter · Place 1 › Div 2 ×3 (corp.assets.assembled)',
      'Place 1 › Div 2 ×2 (corp.assets.packaged)',
      'Place 1 › Div 2 ×1',
    ]);
  });

  it('exports the full blueprint kind and the stock status', () => {
    const values = byHeader(item);
    expect(values['corp.assets.csv.kind']).toBe('assets.blueprintBadge.original.label');
    expect(values['corp.assets.csv.stockStatus']).toBe('corp.assets.csv.stock.none-owned');
    const copy = {
      ...item,
      ledger: { ...item.ledger, isBlueprintCopy: true, stock: null },
    } as unknown as ItemTableRow;
    expect(byHeader(copy)['corp.assets.csv.kind']).toBe('assets.blueprintBadge.copy.label');
    expect(byHeader(copy)['corp.assets.csv.stockStatus']).toBeNull();
  });

  it('leaves the kind blank for an ordinary item', () => {
    const plain = corpAssetItemCsvColumns(t, { labels, assetNames: {}, blueprintTypeIds: null });
    expect(plain[1].value(item)).toBeNull();
  });
});

describe('corpAssetLocationCsvColumns', () => {
  it("carries the group header's facts on every row", () => {
    const columns = corpAssetLocationCsvColumns(t, labels);
    const row = {
      groupLabel: 'Efa VII',
      label: 'Div 1',
      groupItems: 12,
      groupValue: 3000,
      groupEmpty: true,
      groupDivisionsInUse: 0,
      cell: { itemCount: 0, topStacks: [], estimatedValue: 0, volume: null },
    } as unknown as LocationRow;
    expect(columns.slice(6).map((c) => c.value(row))).toEqual([
      12,
      3000,
      0,
      'common.exportFlagYes',
    ]);
    expect(columns.slice(6).map((c) => c.header)).toEqual([
      'corp.assets.csv.groupItems',
      'corp.assets.csv.groupValue',
      'corp.assets.csv.divisionsInUse',
      'corp.assets.csv.emptyOffice',
    ]);
  });
});

describe('corpAssetItemCsvColumns stack overflow', () => {
  it('spills a type with more stacks than one cell holds into further Stacks columns, losing none', () => {
    const many = {
      ...item,
      ledger: {
        ...item.ledger,
        stacks: Array.from({ length: 1500 }, (_, i) => stack(1000 + i, 1, true)),
      },
    } as unknown as ItemTableRow;
    const columns = corpAssetItemCsvColumns(t, { labels, assetNames: {}, blueprintTypeIds: null }, [
      many,
      item,
    ]);
    const stackCols = columns.filter((c) => c.header.startsWith('corp.assets.csv.stacks'));
    expect(stackCols.length).toBeGreaterThan(1);
    const cells = stackCols.map((c) => c.value(many) as string | null);
    expect(cells.every((cell) => cell === null || cell.length < 32_767)).toBe(true);
    expect(cells.join('; ').split('; ')).toHaveLength(1500);
    expect(stackCols[1].value(item)).toBeNull();
  });
});
