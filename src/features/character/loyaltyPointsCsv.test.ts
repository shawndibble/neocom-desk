import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import { loyaltyPointsCsvColumns } from './loyaltyPointsCsv';

const t = (k: string) => k;
const nameFor = (id: number) => (id === 1000125 ? 'CONCORD' : `#${id}`);

describe('loyaltyPointsCsvColumns', () => {
  it('uses the table headers: corporation, then points', () => {
    expect(loyaltyPointsCsvColumns(t, nameFor).map((c) => c.header)).toEqual([
      'loyalty.corporation',
      'loyalty.points',
    ]);
  });

  it('names the corporation as the table does and writes points as a raw number', () => {
    const csv = toCsv(
      [
        { corporation_id: 1000125, loyalty_points: 12_500 },
        { corporation_id: 42, loyalty_points: 0 },
      ],
      loyaltyPointsCsvColumns(t, nameFor)
    );
    const [, concord, unknown] = csv.split('\r\n');
    expect(concord).toBe('"CONCORD",12500');
    expect(unknown).toBe('"#42",0');
  });
});
