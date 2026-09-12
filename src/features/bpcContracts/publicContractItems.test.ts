import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsiError } from '@/esi/client';

const getPublicContractItems = vi.fn();
vi.mock('@/esi/endpoints', () => ({
  getPublicContractItems: (...args: unknown[]) => getPublicContractItems(...args),
}));

import { loadPublicContractItems } from './publicContractItems';

beforeEach(() => {
  getPublicContractItems.mockReset();
});

describe('loadPublicContractItems', () => {
  it('reports item lines as a distinct outcome from "not found"', async () => {
    getPublicContractItems.mockResolvedValue({
      data: [{ record_id: 1, type_id: 34, quantity: 100, is_included: true }],
    });

    const result = await loadPublicContractItems(12345);

    expect(result?.data).toEqual({
      kind: 'items',
      items: [{ record_id: 1, type_id: 34, quantity: 100, is_included: true }],
    });
  });

  it('maps a 404 (ESI no longer recognizes the contract as public) to a "not-found" outcome, not a failure', async () => {
    getPublicContractItems.mockRejectedValue(new EsiError(404, 'not found'));

    // A distinct contractId from the previous test: the cache is keyed by
    // contractId and shared across tests in this file, so reusing one would
    // read the earlier cached row instead of exercising the mock.
    const result = await loadPublicContractItems(67890);

    expect(result?.data).toEqual({ kind: 'not-found' });
  });

  it('still surfaces a real failure (no cache, non-404 error) as null', async () => {
    getPublicContractItems.mockRejectedValue(new EsiError(500, 'server error'));

    const result = await loadPublicContractItems(99999);

    expect(result).toBeNull();
  });
});
