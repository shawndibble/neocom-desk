import { beforeEach, describe, expect, it, vi } from 'vitest';

const fns = vi.hoisted(() => ({ callable: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: fns.httpsCallable }));
vi.mock('./firebaseApp', () => ({ getSyncFunctions: () => 'functions' }));

import { callRouted, routerFor } from './routedCallable';

describe('routerFor', () => {
  it.each([
    ['createCommunityCallable', 'communityCall'],
    ['reserveCommunityPledgeMailCallable', 'communityCall'],
    ['reclaimCorpTaxBookCallable', 'corpTaxBookCall'],
    ['setCorpTaxBookFeederRateCallable', 'corpTaxBookCall'],
    ['verifyCorpOfficerCallable', 'corpTaxBookCall'],
  ])('%s goes through %s', (name, router) => {
    expect(routerFor(name)).toBe(router);
  });

  it('refuses a callable that has no router', () => {
    expect(() => routerFor('registerDevice')).toThrow(/No callable router/);
  });
});

describe('callRouted', () => {
  beforeEach(() => {
    fns.httpsCallable.mockReset().mockReturnValue(fns.callable);
    fns.callable.mockReset().mockResolvedValue({ data: { ok: true } });
  });

  it('sends the action and data to the router and returns its data', async () => {
    const out = await callRouted('joinCommunityCallable', { inviteCode: 'x' });
    expect(fns.httpsCallable).toHaveBeenCalledWith('functions', 'communityCall');
    expect(fns.callable).toHaveBeenCalledWith({
      action: 'joinCommunityCallable',
      data: { inviteCode: 'x' },
    });
    expect(out).toEqual({ ok: true });
  });
});
