import { describe, expect, it, vi } from 'vitest';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import { loadBlueprintCopyValues } from './blueprintCopyValues';

const snapshot = vi.hoisted(() => ({ rows: [] as unknown[], originals: [] as unknown[] }));
vi.mock('@/features/bpcContracts/syncedContracts', () => ({
  loadPublicBpcContracts: vi.fn(async () => ({ data: snapshot })),
}));

function listing(overrides: Partial<BpcContractRow>): BpcContractRow {
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

describe('loadBlueprintCopyValues', () => {
  it('loads nothing when no asset is a copy', async () => {
    const loadBlueprints = vi.fn();
    const loadListings = vi.fn();
    const values = await loadBlueprintCopyValues(
      1,
      [{ item_id: 1, type_id: 100 }],
      loadBlueprints,
      loadListings
    );
    expect(values.size).toBe(0);
    expect(loadBlueprints).not.toHaveBeenCalled();
    expect(loadListings).not.toHaveBeenCalled();
  });

  it('joins a copy to its blueprint record for ME/TE/runs', async () => {
    const values = await loadBlueprintCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => [{ item_id: 7, material_efficiency: 10, time_efficiency: 20, runs: 4 }],
      async () => [
        listing({ me: 10, te: 20, price: 10_000_000, runs: 10 }),
        listing({ me: 0, te: 0, price: 1_000, runs: 10 }),
      ]
    );
    expect(values.get(7)).toBe(4_000_000);
  });

  it('prices a copy at ME0/TE0 when its blueprint record cannot be read', async () => {
    const values = await loadBlueprintCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => {
        throw new Error('403');
      },
      async () => [
        listing({ me: 10, te: 20, price: 99_000_000 }),
        listing({ me: 0, te: 0, price: 2_000_000 }),
      ]
    );
    expect(values.get(7)).toBe(2_000_000);
  });

  it("reads the snapshot's originals too, so a copy sold beside its original is voided", async () => {
    snapshot.rows = [listing({ contractId: 1, runs: 1, price: 2_000_000_000 })];
    snapshot.originals = [listing({ contractId: 1, runs: -1, price: 2_000_000_000 })];
    const values = await loadBlueprintCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => null
    );
    expect(values.get(7)).toBe(0);

    snapshot.originals = [];
    const unvoided = await loadBlueprintCopyValues(
      1,
      [{ item_id: 7, type_id: 100, is_blueprint_copy: true }],
      async () => null
    );
    expect(unvoided.get(7)).toBe(2_000_000_000);
  });
});
