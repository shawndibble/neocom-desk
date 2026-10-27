import { describe, expect, it } from 'vitest';
import { measureContractTypeChanges } from './contractTypeChanges.js';
import type { PublicContractOfferRow } from './publicContracts.js';

const row = (over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow => ({
  contractId: 1,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 34,
  price: 100,
  isAuction: false,
  quantity: 1,
  dateExpired: 1_800_000_000_000,
  ...over,
});

describe('measureContractTypeChanges', () => {
  it('reports every type changed on the first run', () => {
    const { stats, hashes } = measureContractTypeChanges(
      [row(), row({ contractId: 2 }), row({ typeId: 35 })],
      null
    );
    expect(stats.typeCount).toBe(2);
    expect(stats.rowCount).toBe(3);
    expect(stats.changedTypeCount).toBe(2);
    expect(Object.keys(hashes).sort()).toEqual(['34', '35']);
  });

  it('hash ignores row order', () => {
    const a = measureContractTypeChanges([row({ contractId: 1 }), row({ contractId: 2 })], null);
    const b = measureContractTypeChanges([row({ contractId: 2 }), row({ contractId: 1 })], null);
    expect(b.hashes).toEqual(a.hashes);
    expect(
      measureContractTypeChanges([row({ contractId: 2 }), row({ contractId: 1 })], a.hashes).stats
        .changedTypeCount
    ).toBe(0);
  });

  it('counts only types whose rows changed', () => {
    const first = measureContractTypeChanges([row(), row({ typeId: 35 })], null);
    const second = measureContractTypeChanges(
      [row({ price: 101 }), row({ typeId: 35 })],
      first.hashes
    );
    expect(second.stats.changedTypeCount).toBe(1);
  });

  it('counts a type that appeared or vanished as changed', () => {
    const first = measureContractTypeChanges([row(), row({ typeId: 35 })], null);
    const second = measureContractTypeChanges([row(), row({ typeId: 36 })], first.hashes);
    // 36 is new, 35 is gone.
    expect(second.stats.changedTypeCount).toBe(2);
  });

  it('reports sizes and the largest type', () => {
    const { stats } = measureContractTypeChanges(
      [row(), row({ contractId: 2 }), row({ contractId: 3 }), row({ typeId: 35 })],
      null
    );
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.totalGzipBytes).toBeGreaterThan(0);
    expect(stats.largestTypeRows).toBe(3);
    expect(stats.largestTypeBytes).toBeGreaterThan(0);
  });

  it('handles no rows', () => {
    const { stats, hashes } = measureContractTypeChanges([], { '34': 'x' });
    expect(stats).toMatchObject({ typeCount: 0, rowCount: 0, changedTypeCount: 1, totalBytes: 0 });
    expect(hashes).toEqual({});
  });
});
