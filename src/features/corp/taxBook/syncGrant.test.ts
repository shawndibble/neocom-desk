import { describe, it, expect, vi, beforeEach } from 'vitest';

const remote = vi.hoisted(() => ({
  save: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('@/sync/corpSyncGrantApi', () => ({
  saveCorpSyncGrantRemote: remote.save,
  revokeCorpSyncGrantRemote: remote.revoke,
}));
const auth = vi.hoisted(() => ({ complete: vi.fn(), token: vi.fn() }));
vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  completeCorpSyncLogin: auth.complete,
  getValidAccessToken: auth.token,
}));
vi.mock('@/observability/reportFailure', () => ({ reportFailure: vi.fn() }));

import { completeCorpSyncGrant, turnOffScheduledSync } from './syncGrant';

const result = (characterId: number, expectedCharacterId = characterId) => ({
  expectedCharacterId,
  characterId,
  corporationId: 98000001,
  name: `Pilot ${characterId}`,
  accessToken: 'access',
  refreshToken: 'refresh',
});

beforeEach(() => {
  vi.clearAllMocks();
  remote.save.mockResolvedValue(undefined);
  remote.revoke.mockResolvedValue(undefined);
  auth.token.mockResolvedValue('fresh-token');
});

describe('completeCorpSyncGrant', () => {
  it('on a match: sends both tokens and the book to the server as that Character', async () => {
    auth.complete.mockResolvedValue(result(111));
    expect(await completeCorpSyncGrant({ code: 'c', state: 's' })).toEqual({
      status: 'on',
      characterId: 111,
      name: 'Pilot 111',
    });
    expect(remote.save).toHaveBeenCalledWith(111, {
      corporationId: 98000001,
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('on a mismatch: sends nothing', async () => {
    auth.complete.mockResolvedValue(result(222, 111));
    expect(await completeCorpSyncGrant({ code: 'c', state: 's' })).toEqual({
      status: 'mismatch',
      expectedCharacterId: 111,
      authorizedCharacterId: 222,
      authorizedName: 'Pilot 222',
    });
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("surfaces the server's reason when it refuses", async () => {
    auth.complete.mockResolvedValue(result(111));
    remote.save.mockRejectedValue(
      Object.assign(new Error('no'), { details: { reason: 'not-an-editor' } })
    );
    expect(await completeCorpSyncGrant({ code: 'c', state: 's' })).toEqual({
      status: 'failed',
      characterId: 111,
      reason: 'not-an-editor',
    });
  });
});

describe('turnOffScheduledSync', () => {
  it("the holder's own revoke carries no access token", async () => {
    expect(await turnOffScheduledSync({ characterId: 7, corporationId: 5, asCeo: false })).toBe(
      true
    );
    expect(remote.revoke).toHaveBeenCalledWith(7, { corporationId: 5 });
    expect(auth.token).not.toHaveBeenCalled();
  });

  it("the CEO's revoke carries a fresh access token for the live role check", async () => {
    expect(await turnOffScheduledSync({ characterId: 1, corporationId: 5, asCeo: true })).toBe(
      true
    );
    expect(remote.revoke).toHaveBeenCalledWith(1, { corporationId: 5, accessToken: 'fresh-token' });
  });

  it('resolves false when the server could not do it', async () => {
    remote.revoke.mockRejectedValue(new Error('down'));
    expect(await turnOffScheduledSync({ characterId: 7, corporationId: 5, asCeo: false })).toBe(
      false
    );
  });
});
