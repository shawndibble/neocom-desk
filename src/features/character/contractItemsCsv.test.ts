import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { ContractItem } from '@/esi/endpoints';
import { contractItemsCsvColumns } from './contractItemsCsv';

const t = (k: string) => k;
const typeNames = new Map([[2048, 'Damage Control II']]);

function item(overrides: Partial<ContractItem> = {}): ContractItem {
  return {
    record_id: 1,
    type_id: 2048,
    quantity: 744,
    is_included: true,
    is_singleton: false,
    ...overrides,
  };
}

describe('contractItemsCsvColumns', () => {
  it("uses the detail table's headers: item, then quantity", () => {
    expect(contractItemsCsvColumns(t, typeNames).map((c) => c.header)).toEqual([
      'contracts.detailItemName',
      'contracts.detailQuantity',
    ]);
  });

  it('names the item as the table does and writes quantity as a raw number', () => {
    const csv = toCsv(
      [item(), item({ record_id: 2, type_id: 99999, quantity: 1_000 })],
      contractItemsCsvColumns(t, typeNames)
    );
    const [, known, unknown] = csv.split('\r\n');
    expect(known).toBe('"Damage Control II",744');
    expect(unknown).toBe('"#99999",1000');
  });
});
