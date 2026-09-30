import { describe, expect, it, vi } from 'vitest';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import { loadAssetCopyValues } from './assetCopyValues';

const snapshot = vi.hoisted(() => ({ rows: [] as unknown[], originals: [] as unknown[] }));
vi.mock('@/features/bpcContracts/syncedContracts', () => ({
  loadPublicBpcContracts: vi.fn(async () => ({ data: snapshot })),
}));

function offer(overrides: Partial<BpcContractRow>): BpcContractRow {
  return {
    contractId: Math.random(),
    regionId: 1,
    locationId: 1,
    typeId: 100,
    price: 10_000_000,
    isAuction: false,
    me: 0,
    te: 0,
    runs: 10,
    quantity: 1,
    dateExpired: 0,
    isMultiType: false,
    ...overrides,
  };
}

describe('loadAssetCopyValues', () => {
  it('loads nothing when no asset is a copy', async () => {
    const loadBlueprints = vi.fn();
    const loadOffers = vi.fn();
    const values = await loadAssetCopyValues(
      1,
      [{ item_id: 1, type_id: 100 }],
      loadBlueprints,
      loadOffers
    );
    expect(values.size).toBe(0);
    expect(loadBlueprints).not.toHaveBeenCalled();
    expect(loadOffers).not.toHaveBeenCalled();
  });

  it('joins a copy to its blueprint record for ME/TE/runs', async () => {
    const values = await loadAssetCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => [{ item_id: 7, material_efficiency: 10, time_efficiency: 20, runs: 4 }],
      async () => [
        offer({ me: 10, te: 20, price: 10_000_000, runs: 10 }),
        offer({ me: 0, te: 0, price: 1_000, runs: 10 }),
      ]
    );
    expect(values.get(7)).toBe(4_000_000);
  });

  it('prices a copy at ME0/TE0 when its blueprint record cannot be read', async () => {
    const values = await loadAssetCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => {
        throw new Error('403');
      },
      async () => [
        offer({ me: 10, te: 20, price: 99_000_000 }),
        offer({ me: 0, te: 0, price: 2_000_000 }),
      ]
    );
    expect(values.get(7)).toBe(2_000_000);
  });

  it("reads the snapshot's originals too, so a copy sold beside its original is voided", async () => {
    snapshot.rows = [offer({ contractId: 1, runs: 1, price: 2_000_000_000 })];
    snapshot.originals = [offer({ contractId: 1, runs: -1, price: 2_000_000_000 })];
    const values = await loadAssetCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => null
    );
    expect(values.get(7)).toBe(0);

    snapshot.originals = [];
    const unvoided = await loadAssetCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => null
    );
    expect(unvoided.get(7)).toBe(2_000_000_000);
  });
});
