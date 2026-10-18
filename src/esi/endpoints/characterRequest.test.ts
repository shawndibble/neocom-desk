import { beforeEach, describe, expect, it, vi } from 'vitest';

const esiFetch = vi.fn();
const fetchAllPagesStatus = vi.fn();
vi.mock('../client', () => ({ esiFetch: (...a: unknown[]) => esiFetch(...a) }));
vi.mock('../paginated', () => ({
  fetchAllPagesStatus: (...a: unknown[]) => fetchAllPagesStatus(...a),
}));

import { characterGet, characterPages } from './characterRequest';

describe('characterGet / characterPages', () => {
  beforeEach(() => {
    esiFetch.mockReset().mockResolvedValue('ok');
    fetchAllPagesStatus.mockReset().mockResolvedValue('paged');
  });

  it('fills the registry route and passes the registry id', async () => {
    const signal = new AbortController().signal;
    await expect(characterGet('getCharacterWallet', 42, { etag: 'e', signal })).resolves.toBe('ok');
    expect(esiFetch).toHaveBeenCalledWith('/characters/42/wallet', {
      etag: 'e',
      signal,
      characterId: 42,
      endpointId: 'getCharacterWallet',
    });
  });

  it('pages through the same route', async () => {
    await expect(characterPages('getCharacterContacts', 7, {})).resolves.toBe('paged');
    expect(fetchAllPagesStatus).toHaveBeenCalledWith('/characters/7/contacts', {
      characterId: 7,
      endpointId: 'getCharacterContacts',
    });
  });
});
