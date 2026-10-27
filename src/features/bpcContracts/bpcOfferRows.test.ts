import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

const loadPublicBpcContracts = vi.hoisted(() => vi.fn());
vi.mock('./syncedContracts', () => ({ loadPublicBpcContracts }));

import { bpcOfferRows, loadBpcOfferRows } from './bpcOfferRows';

const row = (contractId: number): BpcContractRow => ({ contractId }) as BpcContractRow;

beforeEach(() => {
  loadPublicBpcContracts.mockReset();
});

describe('bpcOfferRows', () => {
  it('lists copies, then originals', () => {
    expect(
      bpcOfferRows({ rows: [row(1), row(2)], originals: [row(3)] }).map((r) => r.contractId)
    ).toEqual([1, 2, 3]);
  });

  it('reads a snapshot cached before originals existed as copies only', () => {
    expect(bpcOfferRows({ rows: [row(1)] })).toEqual([row(1)]);
  });
});

describe('loadBpcOfferRows', () => {
  it('merges the loaded snapshot', async () => {
    loadPublicBpcContracts.mockResolvedValue({
      data: { rows: [row(1)], originals: [row(2)], lastSyncedAt: 5 },
    });
    expect((await loadBpcOfferRows())?.map((r) => r.contractId)).toEqual([1, 2]);
  });

  it('is null when no snapshot is available', async () => {
    loadPublicBpcContracts.mockResolvedValue(null);
    expect(await loadBpcOfferRows()).toBeNull();
  });

  it('is null when the load fails', async () => {
    loadPublicBpcContracts.mockRejectedValue(new Error('offline'));
    expect(await loadBpcOfferRows()).toBeNull();
  });
});
