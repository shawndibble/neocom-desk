import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupPayeeName, lookupPayeeNames, payeeNameKey } from './payeeLookup';

const mocks = vi.hoisted(() => ({
  resolvePayeeName: vi.fn(),
  postUniverseIds: vi.fn(),
}));
vi.mock('./payeeEntitySearch', () => ({ resolvePayeeName: mocks.resolvePayeeName }));
vi.mock('@/esi/endpoints', () => ({ postUniverseIds: mocks.postUniverseIds }));

beforeEach(() => vi.clearAllMocks());

describe('lookupPayeeName', () => {
  it('finds the one corporation or character of that name', async () => {
    mocks.resolvePayeeName.mockResolvedValue([{ id: 2, name: 'Moon Corp', kind: 'corporation' }]);
    expect(await lookupPayeeName('moon corp')).toEqual({
      status: 'found',
      match: { id: 2, name: 'Moon Corp', kind: 'corporation' },
    });
  });

  it('never makes a new Payee an alliance: an alliance alone is no match', async () => {
    mocks.resolvePayeeName.mockResolvedValue([{ id: 3, name: 'Moon', kind: 'alliance' }]);
    expect(await lookupPayeeName('Moon')).toEqual({ status: 'none' });
  });

  it('ignores an alliance beside the one corporation of that name', async () => {
    mocks.resolvePayeeName.mockResolvedValue([
      { id: 2, name: 'Moon', kind: 'corporation' },
      { id: 3, name: 'Moon', kind: 'alliance' },
    ]);
    expect(await lookupPayeeName('Moon')).toMatchObject({ status: 'found', match: { id: 2 } });
  });

  it('returns every candidate when a corporation and a character share the name', async () => {
    const both = [
      { id: 2, name: 'Moon', kind: 'corporation' },
      { id: 1, name: 'Moon', kind: 'character' },
    ];
    mocks.resolvePayeeName.mockResolvedValue(both);
    expect(await lookupPayeeName('Moon')).toEqual({ status: 'several', matches: both });
  });

  it('says nobody has a moon name', async () => {
    mocks.resolvePayeeName.mockResolvedValue([]);
    expect(await lookupPayeeName('Moon 1 Planet 2')).toEqual({ status: 'none' });
  });

  it('says the lookup failed, never that nobody has the name, when ESI cannot be reached', async () => {
    mocks.resolvePayeeName.mockRejectedValue(new Error('offline'));
    expect(await lookupPayeeName('Moon Corp')).toEqual({ status: 'failed' });
  });
});

describe('lookupPayeeNames', () => {
  it('asks ESI once for every name and answers each by its name in any case', async () => {
    mocks.postUniverseIds.mockResolvedValue({
      corporations: [{ id: 2, name: 'Moon Corp' }],
      characters: [
        { id: 1, name: 'Shared' },
        { id: 5, name: 'Pilot' },
      ],
      alliances: [{ id: 3, name: 'Alliance Only' }],
    });
    const found = await lookupPayeeNames([
      'moon corp',
      'Pilot',
      'Moon 1',
      'Alliance Only',
      'Pilot',
    ]);
    expect(mocks.postUniverseIds).toHaveBeenCalledTimes(1);
    expect(mocks.postUniverseIds).toHaveBeenCalledWith([
      'moon corp',
      'Pilot',
      'Moon 1',
      'Alliance Only',
    ]);
    expect(found.get(payeeNameKey('Moon Corp'))).toEqual({
      status: 'found',
      match: { id: 2, name: 'Moon Corp', kind: 'corporation' },
    });
    expect(found.get(payeeNameKey('pilot'))).toMatchObject({ status: 'found', match: { id: 5 } });
    expect(found.get(payeeNameKey('Moon 1'))).toEqual({ status: 'none' });
    expect(found.get(payeeNameKey('Alliance Only'))).toEqual({ status: 'none' });
  });

  it('calls nothing for no names, and lets a failed lookup reject', async () => {
    expect((await lookupPayeeNames([' '])).size).toBe(0);
    expect(mocks.postUniverseIds).not.toHaveBeenCalled();
    mocks.postUniverseIds.mockRejectedValue(new Error('offline'));
    await expect(lookupPayeeNames(['Moon Corp'])).rejects.toThrow('offline');
  });
});
