import { describe, expect, it } from 'vitest';
import { latestNetWorthByCharacter } from './latest';
import type { NetWorthSnapshotRow } from './snapshot';

function row(characterId: number, day: string, over: Partial<NetWorthSnapshotRow> = {}) {
  return {
    id: `${characterId}:${day}`,
    characterId,
    day,
    wallet: 100,
    assetValue: 1_000,
    escrow: 10,
    hubId: 'jita',
    updatedAt: 0,
    ...over,
  } satisfies NetWorthSnapshotRow;
}

describe('latestNetWorthByCharacter', () => {
  it('takes each Character’s newest day, whatever order the rows arrive in', () => {
    const map = latestNetWorthByCharacter([
      row(1, '2026-10-30', { wallet: 5 }),
      row(1, '2026-11-01', { wallet: 7 }),
      row(2, '2026-10-01'),
    ]);
    expect(map.get(1)?.day).toBe('2026-11-01');
    expect(map.get(1)?.layers.isk).toBe(7);
    expect(map.get(2)?.day).toBe('2026-10-01');
  });

  it('totals every layer: wallet, assets, escrow, sell stock and contracts', () => {
    const map = latestNetWorthByCharacter([
      row(1, '2026-11-01', { wallet: 1, assetValue: 2, escrow: 3, sellStock: 4, contractStock: 5 }),
    ]);
    expect(map.get(1)?.total).toBe(15);
  });

  it('reads layers an older row lacks as zero', () => {
    const map = latestNetWorthByCharacter([
      row(1, '2026-11-01', { wallet: 1, assetValue: 2, escrow: 3 }),
    ]);
    expect(map.get(1)?.total).toBe(6);
  });

  it('has no entry for a Character with no snapshot', () => {
    expect(latestNetWorthByCharacter([]).has(1)).toBe(false);
  });
});
