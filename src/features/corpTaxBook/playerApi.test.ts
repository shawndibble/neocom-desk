import { beforeEach, describe, expect, it, vi } from 'vitest';

const callRouted = vi.fn();
const ensureSignedIn = vi.fn<(id: number) => Promise<string>>(async () => 'uid');
const getValidAccessToken = vi.fn();

vi.mock('@/sync/routedCallable', () => ({
  callRouted: (name: string, data: unknown, id: number) => callRouted(name, data, id),
}));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: (id: number) => ensureSignedIn(id) }));
vi.mock('@/features/communities/pledgeWrites', () => ({
  underFirebaseSession: <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock('@/auth/session', () => ({
  getValidAccessToken: (id: number) => getValidAccessToken(id),
}));

import { claimPlayerCharacters, declineLink } from './playerApi';

beforeEach(() => {
  callRouted.mockReset();
  ensureSignedIn.mockClear();
  getValidAccessToken.mockReset();
});

describe('claimPlayerCharacters', () => {
  it('sends only short-lived access tokens, one per character, signed in as the first live one', async () => {
    getValidAccessToken.mockImplementation(async (id: number) => `at-${id}`);
    callRouted.mockResolvedValue({ playerId: '1', characterIds: [1, 2], dropped: [] });
    const out = await claimPlayerCharacters([1, 2]);
    expect(out?.characterIds).toEqual([1, 2]);
    expect(ensureSignedIn).toHaveBeenCalledWith(1);
    expect(callRouted).toHaveBeenCalledWith(
      'claimPlayerCharactersCallable',
      { accessTokens: ['at-1', 'at-2'] },
      1
    );
  });

  it('skips a character whose login expired and still claims the rest', async () => {
    getValidAccessToken.mockImplementation(async (id: number) => {
      if (id === 1) throw new Error('invalid_grant');
      return `at-${id}`;
    });
    callRouted.mockResolvedValue({ playerId: '2', characterIds: [2, 3], dropped: [] });
    await claimPlayerCharacters([1, 2, 3]);
    expect(callRouted).toHaveBeenCalledWith(
      'claimPlayerCharactersCallable',
      { accessTokens: ['at-2', 'at-3'] },
      2
    );
  });

  it('claims with one live character, so a sold character is dropped from its old owner', async () => {
    getValidAccessToken.mockImplementation(async (id: number) => {
      if (id === 1) throw new Error('x');
      return 'at';
    });
    callRouted.mockResolvedValue({ playerId: '2', characterIds: [2], dropped: [] });
    await claimPlayerCharacters([1, 2]);
    expect(callRouted).toHaveBeenCalledWith(
      'claimPlayerCharactersCallable',
      { accessTokens: ['at'] },
      2
    );
  });

  it('claims nothing when no character is live', async () => {
    getValidAccessToken.mockRejectedValue(new Error('x'));
    expect(await claimPlayerCharacters([1, 2])).toBeNull();
    expect(callRouted).not.toHaveBeenCalled();
  });

  it('caps at 10 tokens per call', async () => {
    getValidAccessToken.mockImplementation(async (id: number) => `at-${id}`);
    callRouted.mockResolvedValue({ playerId: '1', characterIds: [], dropped: [] });
    await claimPlayerCharacters(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(callRouted.mock.calls[0][1].accessTokens).toHaveLength(10);
  });
});

describe('declineLink', () => {
  it('runs as the added character', async () => {
    callRouted.mockResolvedValue({ declined: true });
    await declineLink(7, { corporationId: 9, minerId: 'solo:3' });
    expect(ensureSignedIn).toHaveBeenCalledWith(7);
    expect(callRouted).toHaveBeenCalledWith(
      'declineCorpTaxBookLinkCallable',
      { corporationId: 9, minerId: 'solo:3' },
      7
    );
  });
});
