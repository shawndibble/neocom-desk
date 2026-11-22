import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { PAYEES } from '@/sync/syncedCollections';
import { utcDay } from '@/engine/localDay';
import {
  DefaultSystemTakenError,
  createPayee,
  loadPayees,
  applyPayeeTerms,
  setPayeesArchived,
  linkPayeeToCorporation,
  rememberPayeeEntity,
  removePayeeRecord,
  updatePayee,
} from './payees';

const syncMock = vi.hoisted(() => ({
  scheduleSync: vi.fn(),
}));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const CHAR_B = 2;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.payees.clear();
});

describe('createPayee', () => {
  it('writes a Payee scoped to the character and schedules a sync', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Some Corp', defaultTaxPct: 10 });

    expect(payee).toMatchObject({ characterId: CHAR_A, name: 'Some Corp', defaultTaxPct: 10 });
    expect(await db.payees.get(payee.id)).toEqual(payee);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A, { collections: ['payees'] });
  });

  it('omits defaultSystems entirely when none are given, rather than writing undefined', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Some Corp', defaultTaxPct: 10 });
    expect('defaultSystems' in payee).toBe(false);
    expect('systemId' in payee).toBe(false);
  });

  it('stamps each Default System with the day it was added', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'Landlord',
      defaultTaxPct: 10,
      defaultSystemIds: [30000142, 30002187],
    });
    const today = utcDay(Date.now());
    expect(payee.defaultSystems).toEqual([
      { systemId: 30000142, from: today },
      { systemId: 30002187, from: today },
    ]);
  });

  it('refuses a system another of the Character’s Payees already defaults, naming that Payee', async () => {
    await createPayee(CHAR_A, {
      name: 'Landlord',
      defaultTaxPct: 10,
      defaultSystemIds: [30000142],
    });
    const attempt = createPayee(CHAR_A, {
      name: 'Other',
      defaultTaxPct: 10,
      defaultSystemIds: [30000142],
    });
    await expect(attempt).rejects.toBeInstanceOf(DefaultSystemTakenError);
    await expect(attempt).rejects.toMatchObject({ systemId: 30000142, holderName: 'Landlord' });
    expect(await loadPayees(CHAR_A)).toHaveLength(1);
  });

  it('lets another Character default the same system', async () => {
    await createPayee(CHAR_A, {
      name: 'Landlord',
      defaultTaxPct: 10,
      defaultSystemIds: [30000142],
    });
    const other = await createPayee(CHAR_B, {
      name: 'Landlord',
      defaultTaxPct: 10,
      defaultSystemIds: [30000142],
    });
    expect(other.defaultSystems).toHaveLength(1);
  });

  it('keeps two characters’ Payees independent', async () => {
    await createPayee(CHAR_A, { name: 'A Corp', defaultTaxPct: 10 });
    await createPayee(CHAR_B, { name: 'B Corp', defaultTaxPct: 5 });

    expect((await loadPayees(CHAR_A)).map((p) => p.name)).toEqual(['A Corp']);
    expect((await loadPayees(CHAR_B)).map((p) => p.name)).toEqual(['B Corp']);
  });
});

describe('rememberPayeeEntity', () => {
  it('records who the Payee is and schedules a sync', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Landlord', defaultTaxPct: 10 });
    vi.clearAllMocks();

    const updated = await rememberPayeeEntity(payee, 90_000_001);

    expect(updated.entityId).toBe(90_000_001);
    expect((await db.payees.get(payee.id))?.entityId).toBe(90_000_001);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A, { collections: ['payees'] });
  });

  it('survives a later name or rate edit — updatePayee spreads the existing record', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Landlord', defaultTaxPct: 10 });
    const learned = await rememberPayeeEntity(payee, 90_000_001);

    const renamed = await updatePayee(learned, { name: 'Landlord Corp', defaultTaxPct: 12 });

    expect(renamed.entityId).toBe(90_000_001);
    expect((await db.payees.get(payee.id))?.entityId).toBe(90_000_001);
  });

  it('re-learns a different recipient — a landlord can start collecting elsewhere', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Landlord', defaultTaxPct: 10 });
    const first = await rememberPayeeEntity(payee, 90_000_001);

    expect((await rememberPayeeEntity(first, 90_000_002)).entityId).toBe(90_000_002);
  });

  // A Payee verified as a corporation or character is who it is: paying its CEO or an officer
  // once must not re-point it (it then stopped matching its Corp Tax Book).
  it('never re-points a Payee verified as someone else', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'Bureau',
      defaultTaxPct: 5,
      entityId: 98_837_836,
      entityKind: 'corporation',
    });
    vi.clearAllMocks();

    expect(await rememberPayeeEntity(payee, 90_000_001)).toBe(payee);
    expect((await db.payees.get(payee.id))?.entityId).toBe(98_837_836);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  // A dialog's copy read before the Payee was verified must not re-point it now.
  it('judges the stored Payee, not a stale unlinked copy', async () => {
    const stale = await createPayee(CHAR_A, { name: 'Bureau', defaultTaxPct: 5 });
    await linkPayeeToCorporation(stale.id, 98_837_836);
    vi.clearAllMocks();

    expect(await rememberPayeeEntity(stale, 90_000_001)).toBe(stale);
    expect(await db.payees.get(stale.id)).toMatchObject({
      entityId: 98_837_836,
      entityKind: 'corporation',
    });
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('writes nothing when the recipient is already recorded', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Landlord', defaultTaxPct: 10 });
    const learned = await rememberPayeeEntity(payee, 90_000_001);
    vi.clearAllMocks();

    expect(await rememberPayeeEntity(learned, 90_000_001)).toBe(learned);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('linkPayeeToCorporation', () => {
  it('links the stored Payee as the corporation, read fresh, and syncs', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Bureau', defaultTaxPct: 5 });
    // Edited since the caller's copy was read: the link keeps the edit.
    await updatePayee(payee, { name: 'Bureau', defaultTaxPct: 7 });
    vi.clearAllMocks();

    await linkPayeeToCorporation(payee.id, 98_837_836);

    expect(await db.payees.get(payee.id)).toMatchObject({
      defaultTaxPct: 7,
      entityId: 98_837_836,
      entityKind: 'corporation',
    });
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A, { collections: ['payees'] });
  });

  it('leaves a Payee already linked, or linked to someone else since', async () => {
    const linked = await createPayee(CHAR_A, {
      name: 'Bureau',
      defaultTaxPct: 5,
      entityId: 98_837_836,
      entityKind: 'corporation',
    });
    const other = await createPayee(CHAR_A, {
      name: 'Bureau',
      defaultTaxPct: 5,
      entityId: 1,
      entityKind: 'corporation',
    });
    vi.clearAllMocks();

    await linkPayeeToCorporation(linked.id, 98_837_836);
    await linkPayeeToCorporation(other.id, 98_837_836);

    expect((await db.payees.get(other.id))?.entityId).toBe(1);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('updatePayee', () => {
  it('overwrites name and tax %, bumping updatedAt', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Old Name', defaultTaxPct: 10 });
    const updated = await updatePayee(payee, { name: 'New Name', defaultTaxPct: 15 });

    expect(updated).toMatchObject({ name: 'New Name', defaultTaxPct: 15 });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(payee.updatedAt);
    expect(await db.payees.get(payee.id)).toMatchObject({ name: 'New Name', defaultTaxPct: 15 });
  });

  it('keeps the Default Systems, and the day each was added, when the input carries none', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'A',
      defaultTaxPct: 10,
      defaultSystemIds: [1],
    });
    const updated = await updatePayee(payee, { name: 'Renamed', defaultTaxPct: 12 });
    expect(updated.defaultSystems).toEqual(payee.defaultSystems);
  });

  it('adds and removes Default Systems, keeping the start day of one that stays', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'A',
      defaultTaxPct: 10,
      defaultSystemIds: [1],
    });
    const old = { ...payee, defaultSystems: [{ systemId: 1, from: '2026-01-01' }] };
    await db.payees.put(old);
    const updated = await updatePayee(old, {
      name: 'A',
      defaultTaxPct: 10,
      defaultSystemIds: [1, 2],
    });
    expect(updated.defaultSystems).toEqual([
      { systemId: 1, from: '2026-01-01' },
      { systemId: 2, from: utcDay(Date.now()) },
    ]);
    const emptied = await updatePayee(updated, {
      name: 'A',
      defaultTaxPct: 10,
      defaultSystemIds: [],
    });
    expect('defaultSystems' in emptied).toBe(false);
    expect('defaultSystems' in (await db.payees.get(payee.id))!).toBe(false);
  });

  it('refuses to take a system from another Payee, and a Payee may keep its own', async () => {
    const a = await createPayee(CHAR_A, { name: 'A', defaultTaxPct: 10, defaultSystemIds: [1] });
    const b = await createPayee(CHAR_A, { name: 'B', defaultTaxPct: 10 });
    await expect(
      updatePayee(b, { name: 'B', defaultTaxPct: 10, defaultSystemIds: [1] })
    ).rejects.toMatchObject({ holderName: 'A' });
    await expect(
      updatePayee(a, { name: 'A', defaultTaxPct: 10, defaultSystemIds: [1] })
    ).resolves.toBeTruthy();
  });
});

describe('loadPayees', () => {
  it('folds a legacy remembered system into Default Systems once, from today', async () => {
    await db.payees.put({
      id: 'old',
      characterId: CHAR_A,
      name: 'Old',
      defaultTaxPct: 10,
      systemId: 30000142,
      updatedAt: 1,
    });
    const [payee] = await loadPayees(CHAR_A);
    expect(payee.defaultSystems).toEqual([{ systemId: 30000142, from: utcDay(Date.now()) }]);
    expect('systemId' in payee).toBe(false);
    expect('systemId' in (await db.payees.get('old'))!).toBe(false);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A, { collections: ['payees'] });
  });

  it('gives a system two legacy Payees shared to just one of them', async () => {
    for (const id of ['b', 'a']) {
      await db.payees.put({
        id,
        characterId: CHAR_A,
        name: id,
        defaultTaxPct: 10,
        systemId: 30000142,
        updatedAt: 1,
      });
    }
    const held = (await loadPayees(CHAR_A)).filter((p) => p.defaultSystems?.length);
    expect(held.map((p) => p.id)).toEqual(['a']);
  });
});

describe('removePayeeRecord', () => {
  it('deletes and tombstones the Payee, leaving the sync to the ledger action', async () => {
    const payee = await createPayee(CHAR_A, { name: 'A', defaultTaxPct: 10 });
    syncMock.scheduleSync.mockClear();

    await removePayeeRecord(payee);

    expect(await db.payees.get(payee.id)).toBeUndefined();
    expect((await readTombstones(tombstoneKey(PAYEES, CHAR_A))).map((t) => t.id)).toEqual([
      payee.id,
    ]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });
});

describe('Payee entity kind', () => {
  it('createPayee stores entityId and entityKind when given', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'Moon Corp',
      defaultTaxPct: 10,
      entityId: 98_000_001,
      entityKind: 'corporation',
    });
    expect(await db.payees.get(payee.id)).toMatchObject({
      entityId: 98_000_001,
      entityKind: 'corporation',
    });
  });

  it('updatePayee keeps the entity when the input omits it, and deletes both keys on null', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'Moon Corp',
      defaultTaxPct: 10,
      entityId: 98_000_001,
      entityKind: 'corporation',
    });
    const kept = await updatePayee(payee, { name: 'Moon Corp 2', defaultTaxPct: 10 });
    expect(kept).toMatchObject({ entityId: 98_000_001, entityKind: 'corporation' });

    const cleared = await updatePayee(kept, {
      name: 'Moon 1 Planet 2',
      defaultTaxPct: 10,
      entityId: null,
      entityKind: null,
    });
    const stored = await db.payees.get(payee.id);
    expect('entityId' in cleared || 'entityKind' in cleared).toBe(false);
    expect(stored && ('entityId' in stored || 'entityKind' in stored)).toBe(false);
  });

  it('rememberPayeeEntity records a known kind but never overwrites a verified one', async () => {
    const payee = await createPayee(CHAR_A, {
      name: 'Landlord',
      defaultTaxPct: 10,
      entityId: 90_000_001,
      entityKind: 'corporation',
    });
    expect(await rememberPayeeEntity(payee, 90_000_001, 'character')).toBe(payee);

    const bare = await createPayee(CHAR_A, {
      name: 'Other',
      defaultTaxPct: 10,
      entityId: 90_000_002,
    });
    expect((await rememberPayeeEntity(bare, 90_000_002, 'character')).entityKind).toBe('character');
  });

  // Re-pointing a verified Payee to a payment's recipient is what made a member's Corp Tax Book
  // Payee stop matching its book: a verified link is kept (`never re-points a Payee verified …`).
  it('rememberPayeeEntity keeps a verified Payee, and re-learns only an unverified one', async () => {
    const verified = await createPayee(CHAR_A, {
      name: 'Landlord',
      defaultTaxPct: 10,
      entityId: 90_000_001,
      entityKind: 'corporation',
    });
    expect(await rememberPayeeEntity(verified, 90_000_005)).toBe(verified);
    const learned = await createPayee(CHAR_A, {
      name: 'Landlord 2',
      defaultTaxPct: 10,
      entityId: 90_000_001,
    });
    expect((await rememberPayeeEntity(learned, 90_000_005)).entityId).toBe(90_000_005);
  });
});

describe('applyPayeeTerms', () => {
  it("copies a Payee's name, rate, hub and link onto the others, keeping their Default Systems", async () => {
    const source = await createPayee(CHAR_A, {
      name: 'BUH',
      defaultTaxPct: 7,
      hubId: 'amarr',
      entityId: 9,
      entityKind: 'corporation',
    });
    const other = await createPayee(CHAR_B, {
      name: 'Bureau',
      defaultTaxPct: 10,
      defaultSystemIds: [30000142],
      entityId: 9,
      entityKind: 'corporation',
    });
    vi.clearAllMocks();

    await applyPayeeTerms(source, [source, other]);

    const stored = await db.payees.get(other.id);
    expect(stored).toMatchObject({
      name: 'BUH',
      defaultTaxPct: 7,
      hubId: 'amarr',
      entityId: 9,
      entityKind: 'corporation',
    });
    expect(stored?.defaultSystems?.map((s) => s.systemId)).toEqual([30000142]);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(1);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_B, { collections: ['payees'] });
  });

  it('drops a hub the source does not have, as the default hub is stored as none', async () => {
    const source = await createPayee(CHAR_A, { name: 'BUH', defaultTaxPct: 7 });
    const other = await createPayee(CHAR_B, { name: 'BUH', defaultTaxPct: 7, hubId: 'amarr' });
    await applyPayeeTerms(source, [other]);
    expect('hubId' in ((await db.payees.get(other.id)) ?? {})).toBe(false);
  });
});

describe('setPayeesArchived', () => {
  it('stamps every record of a merged Payee, syncing each Character once, and unarchives by dropping the key', async () => {
    const a = await createPayee(CHAR_A, { name: 'Ion Strider', defaultTaxPct: 10 });
    const b = await createPayee(CHAR_B, { name: 'Ion Strider', defaultTaxPct: 10 });
    syncMock.scheduleSync.mockClear();

    await setPayeesArchived([a, b], true, 1_700_000_000_000);
    expect((await db.payees.get(a.id))?.archivedAt).toBe(1_700_000_000_000);
    expect((await db.payees.get(b.id))?.archivedAt).toBe(1_700_000_000_000);
    expect(syncMock.scheduleSync).toHaveBeenCalledTimes(2);

    await setPayeesArchived([a, b], false);
    expect('archivedAt' in (await db.payees.get(a.id))!).toBe(false);
  });

  it("keeps the stored record's newer fields, and writes nothing for one that is gone", async () => {
    const a = await createPayee(CHAR_A, { name: 'Ion Strider', defaultTaxPct: 10 });
    const gone = { ...a, id: 'gone' };
    await db.payees.put({ ...a, defaultTaxPct: 25, updatedAt: a.updatedAt + 5 });

    await setPayeesArchived([a, gone], true, 1_700_000_000_000);
    const stored = await db.payees.get(a.id);
    expect(stored?.defaultTaxPct).toBe(25);
    expect(stored?.archivedAt).toBe(1_700_000_000_000);
    expect(await db.payees.get('gone')).toBeUndefined();
  });
});
