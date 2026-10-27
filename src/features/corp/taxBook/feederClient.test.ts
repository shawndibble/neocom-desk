import { beforeEach, describe, expect, it, vi } from 'vitest';

const fns = vi.hoisted(() => ({ callable: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: fns.httpsCallable }));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFunctions: () => 'functions' }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn().mockResolvedValue('tok') }));

import {
  inviteLink,
  listFeederInvites,
  parseInviteInput,
  revokeFeederInvite,
  setFeederMode,
  setFeederRate,
} from './feederClient';

beforeEach(() => {
  vi.clearAllMocks();
  fns.httpsCallable.mockReturnValue(fns.callable);
  fns.callable.mockResolvedValue({ data: { ok: true } });
});

describe('owner actions', () => {
  it('sets an agreed rate with the access token', async () => {
    await setFeederRate(7, 100, 200, 6.5);
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
    expect(fns.callable).toHaveBeenCalledWith({
      action: 'setCorpTaxBookFeederRateCallable',
      data: { corporationId: 100, accessToken: 'tok', feederCorporationId: 200, pct: 6.5 },
    });
  });

  it('sets the mode and sends a note only when it has text', async () => {
    await setFeederMode(7, 100, 200, 'settled-otherwise', 'paid by hand');
    expect(fns.callable).toHaveBeenLastCalledWith({
      action: 'setCorpTaxBookFeederModeCallable',
      data: {
        corporationId: 100,
        accessToken: 'tok',
        feederCorporationId: 200,
        mode: 'settled-otherwise',
        note: 'paid by hand',
      },
    });
    await setFeederMode(7, 100, 200, 'normal', '  ');
    expect(fns.callable).toHaveBeenLastCalledWith({
      action: 'setCorpTaxBookFeederModeCallable',
      data: { corporationId: 100, accessToken: 'tok', feederCorporationId: 200, mode: 'normal' },
    });
  });

  it('revokes an invite by id', async () => {
    await revokeFeederInvite(7, 100, 'a'.repeat(64));
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
    expect(fns.callable).toHaveBeenCalledWith({
      action: 'revokeCorpTaxBookFeederInviteCallable',
      data: { corporationId: 100, accessToken: 'tok', inviteId: 'a'.repeat(64) },
    });
  });

  it('lists open invites without an access token', async () => {
    const invites = [{ inviteId: 'x', createdBy: 1, createdAt: 2 }];
    fns.callable.mockResolvedValue({ data: { invites } });
    expect(await listFeederInvites(7, 100)).toEqual(invites);
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'corpTaxBookCall');
    expect(fns.callable).toHaveBeenCalledWith({
      action: 'listCorpTaxBookFeederInvitesCallable',
      data: { corporationId: 100 },
    });
  });
});

describe('parseInviteInput', () => {
  it('takes a bare code', () => {
    expect(parseInviteInput('  abc123_DEF-456  ')).toBe('abc123_DEF-456');
  });
  it('takes the code out of a pasted link', () => {
    const link = inviteLink('https://neocomdesk.com', 'abc123_DEF-456');
    expect(parseInviteInput(link)).toBe('abc123_DEF-456');
  });
  it('refuses empty, short or link-without-code input', () => {
    expect(parseInviteInput('')).toBeNull();
    expect(parseInviteInput('abc')).toBeNull();
    expect(parseInviteInput('https://neocomdesk.com/corp/moons')).toBeNull();
    expect(parseInviteInput('not a code!')).toBeNull();
  });
});
