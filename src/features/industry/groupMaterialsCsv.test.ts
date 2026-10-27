import { describe, expect, it } from 'vitest';
import { materialCostLines } from '@/engine/industry/sourcing';
import { groupMaterialsCsvColumns, type GroupMaterialCsvRow } from './groupMaterialsCsv';

const t = (k: string) => k;

function row(typeID: number, quantity: number, buyToShow: number): GroupMaterialCsvRow {
  const [line] = materialCostLines([{ typeID, baseQuantity: quantity, quantity }], { 34: 5 });
  return { ...line, buyToShow };
}

describe('groupMaterialsCsvColumns', () => {
  const owned = new Map([[34, 400]]);
  const columns = groupMaterialsCsvColumns(
    t,
    (id) => `Item ${id}`,
    (id) => (id === 34 ? 0.01 : null),
    (id) => owned.get(id)
  );

  it("orders columns as the table does, on the table's own header keys", () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.material',
      'industry.quantity',
      'industry.volume',
      'industry.ownedQuantity',
      'industry.stillToBuyColumn',
    ]);
  });

  it('exports raw numbers — quantity, m3 volume, owned and still to buy', () => {
    const values = columns.map((c) => c.value(row(34, 1000, 600)));
    expect(values).toEqual(['Item 34', 1000, 10, 400, 600]);
  });

  it('leaves an unresolvable volume and an unclaimed owned quantity blank', () => {
    const values = columns.map((c) => c.value(row(99, 10, 10)));
    expect(values[2]).toBeNull();
    expect(values[3]).toBeNull();
  });

  it('exports a covered row as a real 0, not "Covered"', () => {
    expect(columns[4].value(row(34, 1000, 0))).toBe(0);
  });
});
