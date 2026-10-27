import { describe, expect, it, vi } from 'vitest';
import type { DocumentReference } from 'firebase-admin/firestore';
import { ROLE_CACHE_MS, type OfficerAccess } from './corpTaxBook.js';
import { cacheOfficer, readOfficerCache, revokeOfficer } from './officerCache.js';

const NOW = 1_000_000;
const CORP = 7;
const caller = { uid: 'char:1', ownerHash: 'owner-a' };

const held = (over: Partial<OfficerAccess> = {}): OfficerAccess => ({
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  characterId: 1,
  characterName: 'One',
  ownerHash: 'owner-a',
  corporationId: CORP,
  roles: [],
  checkedAt: NOW - 1000,
  expiresAt: NOW + 60_000,
  ...over,
});

const refWith = (data: OfficerAccess | undefined) => {
  const ref = {
    get: vi.fn(async () => ({ data: () => data })),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  return ref as unknown as DocumentReference & typeof ref;
};

describe('readOfficerCache', () => {
  it('uses a fresh record for the same owner and corporation', async () => {
    const record = held();
    const read = await readOfficerCache(refWith(record), caller, CORP, NOW);
    expect(read.held).toEqual(record);
    expect(read.usable).toBe(record);
  });

  it('has no record and is not usable when nothing is held', async () => {
    const read = await readOfficerCache(refWith(undefined), caller, CORP, NOW);
    expect(read.held).toBeUndefined();
    expect(read.usable).toBeUndefined();
  });

  it.each([
    ['stale check', { checkedAt: NOW - ROLE_CACHE_MS - 1 }],
    ['another owner', { ownerHash: 'owner-b' }],
    ['another corporation', { corporationId: CORP + 1 }],
    ['expired access', { expiresAt: NOW }],
  ])('keeps the record but is not usable: %s', async (_name, over) => {
    const record = held(over);
    const read = await readOfficerCache(refWith(record), caller, CORP, NOW);
    expect(read.held).toEqual(record);
    expect(read.usable).toBeUndefined();
  });
});

describe('cacheOfficer and revokeOfficer', () => {
  it('writes the access record to the ref', async () => {
    const ref = refWith(undefined);
    const access = held();
    await cacheOfficer(ref, access);
    expect(ref.set).toHaveBeenCalledWith(access);
  });

  it('deletes a held record', async () => {
    const ref = refWith(held());
    await revokeOfficer(ref, held());
    expect(ref.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing when no record was held', async () => {
    const ref = refWith(undefined);
    await revokeOfficer(ref, undefined);
    expect(ref.delete).not.toHaveBeenCalled();
  });
});
