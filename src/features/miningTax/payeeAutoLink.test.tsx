import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db, type PayeeRecord } from '@/db';
import { linkUnlinkedPayees, resetPayeeAutoLinkForTests, useAutoLinkPayees } from './payeeAutoLink';

const lookupMock = vi.hoisted(() => ({ lookupPayeeNames: vi.fn() }));
vi.mock('./payeeLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./payeeLookup')>()),
  lookupPayeeNames: lookupMock.lookupPayeeNames,
}));
const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

function payee(id: string, name: string, extra: Partial<PayeeRecord> = {}): PayeeRecord {
  return { id, characterId: 1, name, defaultTaxPct: 10, updatedAt: 1, ...extra };
}

const moonCorp = payee('p1', 'moon corp');
const moonLabel = payee('p2', 'Moon 1 Planet 2');
const linked = payee('p3', 'Pilot', { entityId: 5, entityKind: 'character' });

beforeEach(async () => {
  vi.clearAllMocks();
  resetPayeeAutoLinkForTests();
  await db.payees.clear();
  await db.payees.bulkPut([moonCorp, moonLabel, linked]);
  lookupMock.lookupPayeeNames.mockResolvedValue(
    new Map([
      ['moon corp', { status: 'found', match: { id: 2, name: 'Moon Corp', kind: 'corporation' } }],
      ['moon 1 planet 2', { status: 'none' }],
    ])
  );
});

describe('linkUnlinkedPayees', () => {
  it('links a Payee whose name is one corporation, in one lookup for every unlinked name', async () => {
    const done = await linkUnlinkedPayees([moonCorp, moonLabel, linked]);
    expect(lookupMock.lookupPayeeNames).toHaveBeenCalledTimes(1);
    expect(lookupMock.lookupPayeeNames).toHaveBeenCalledWith(['moon corp', 'Moon 1 Planet 2']);
    expect(done?.map((p) => p.id)).toEqual(['p1']);
    expect(await db.payees.get('p1')).toMatchObject({
      name: 'moon corp',
      entityId: 2,
      entityKind: 'corporation',
    });
    expect('entityId' in ((await db.payees.get('p2')) ?? {})).toBe(false);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(1, { collections: ['payees'] });
  });

  it('asks about each Payee once a session, so nothing retries in a loop', async () => {
    await linkUnlinkedPayees([moonLabel]);
    await linkUnlinkedPayees([moonLabel]);
    expect(lookupMock.lookupPayeeNames).toHaveBeenCalledTimes(1);
  });

  it('asks nothing, and answers null, when every Payee is linked', async () => {
    expect(await linkUnlinkedPayees([linked])).toBeNull();
    expect(lookupMock.lookupPayeeNames).not.toHaveBeenCalled();
  });

  it('changes nothing when the lookup fails', async () => {
    lookupMock.lookupPayeeNames.mockRejectedValue(new Error('offline'));
    expect(await linkUnlinkedPayees([moonCorp])).toEqual([]);
    expect('entityId' in ((await db.payees.get('p1')) ?? {})).toBe(false);
  });
});

describe('useAutoLinkPayees', () => {
  it('reports the Payees still unlinked once checked, and reloads when it linked one', async () => {
    const onLinked = vi.fn();
    const { result } = renderHook(() => useAutoLinkPayees([moonCorp, moonLabel, linked], onLinked));
    // Nothing is said about a Payee before its check has answered.
    expect(result.current).toEqual([]);
    await waitFor(() => expect(onLinked).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(['p2']));
  });
});
