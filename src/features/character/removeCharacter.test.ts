import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedCharacter as seedCharacterRow, seedGrant as seedGrantFor } from '@/test/seed';
import { FULL_RECORDS } from '@/sync/syncedCollectionFixtures';
import { EDITABLE_COLLECTIONS } from '@/sync/syncedCollections';
import { removeCharacter, removeCharacterAfterSync } from './removeCharacter';

const syncMock = vi.hoisted(() => ({
  clearCharacterSyncBookkeeping: vi.fn(async () => {}),
  triggerSync: vi.fn<(characterId: number) => Promise<void>>(async () => {}),
  removeCharacterSession: vi.fn<(characterId: number) => Promise<void>>(async () => {}),
}));
const syncStatus = vi.hoisted(() => ({ configured: false }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncStatus.configured }));
vi.mock('@/sync', () => syncMock);
const pushMock = vi.hoisted(() => ({
  scheduleProjectionRebuild: Object.assign(vi.fn(), { cancel: vi.fn() }),
  unregisterProjectionRegistration: vi.fn(async () => {}),
}));
vi.mock('@/features/notifications/projectionRebuildScheduler', () => ({
  scheduleProjectionRebuild: pushMock.scheduleProjectionRebuild,
}));
const alertsApi = vi.hoisted(() => ({
  saveAlertGrantRemote: vi.fn(async () => {}),
  deleteAlertGrantRemote: vi.fn<(characterId: number) => Promise<void>>(async () => {}),
}));
vi.mock('@/sync/alertsGrantApi', () => alertsApi);
vi.mock('@/features/notifications/projectionUpload', () => ({
  unregisterProjectionRegistration: pushMock.unregisterProjectionRegistration,
}));

async function seedCharacter(characterId: number): Promise<void> {
  await seedCharacterRow(characterId);
  await seedGrantFor(characterId, []);
  await db.skillPlans.add({
    id: `plan-${characterId}`,
    characterId,
    name: 'Plan',
    entries: [],
    remapCount: 1,
    updatedAt: 1,
  });
  await db.buildPlans.add({
    id: `build-${characterId}`,
    characterId,
    name: 'Build',
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
  });
  await db.quickbars.add({ id: String(characterId), characterId, items: [], updatedAt: 1 });
  await db.stationPins.add({
    id: `${characterId}:60003760`,
    characterId,
    locationId: 60003760,
    scope: 'character',
    updatedAt: 1,
  });
  await db.esiCache.put({ characterId, key: 'wallet', value: 100, fetchedAt: 1 });
  await db.payees.add({
    id: `payee-${characterId}`,
    characterId,
    name: 'Some Corp',
    defaultTaxPct: 10,
    updatedAt: 1,
  });
  await db.miningTaxAssignments.add({
    id: `assignment-${characterId}`,
    characterId,
    date: '2026-09-04',
    solarSystemId: 30000142,
    payeeId: `payee-${characterId}`,
    oreLines: [{ typeId: 45490, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
  });
  await db.orderProblemSamples.add({
    orderId: characterId * 1000,
    characterId,
    samples: [{ at: 1, problem: 'healthy' }],
  });
  await db.mailDrafts.add({
    id: `${characterId}:1`,
    characterId,
    mailId: 1,
    kind: 'reply',
    recipients: [{ recipient_id: 2, recipient_type: 'character' }],
    subject: 'RE: Ratting fleet up',
    body: 'On my way',
    updatedAt: 1,
  });
  await db.miningLedgerHistory.put({
    characterId,
    rows: [{ date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: 1230 }],
    fetchedAt: 1,
  });
  await db.walletJournalArchive.put({
    characterId,
    id: 5,
    date: '2026-10-01T00:00:00Z',
    ref_type: 'bounty_prizes',
    description: 'x',
  });
  await db.walletTransactionArchive.put({
    characterId,
    transaction_id: 9,
    date: '2026-10-01T00:00:00Z',
    location_id: 1,
    type_id: 34,
    unit_price: 1,
    quantity: 1,
    client_id: 2,
    is_buy: true,
    journal_ref_id: 9,
    is_personal: true,
  });
  await db.walletArchiveCoverage.put({ characterId, kind: 'journal', windows: [[1, 2]] });
  await db.netWorthSnapshots.put({
    id: `${characterId}:2026-10-07`,
    characterId,
    day: '2026-10-07',
    wallet: 1,
    assetValue: 2,
    plexValue: 3,
    escrow: 4,
    hubId: 'jita',
    updatedAt: 1,
  });
  await db.industryJobHistory.put({
    characterId,
    jobs: [
      {
        job_id: characterId * 100,
        activity_id: 1,
        blueprint_type_id: 638,
        facility_id: 1,
        station_id: 1,
        runs: 1,
        start_date: '2026-09-01T00:00:00Z',
        end_date: '2026-09-01T02:00:00Z',
        status: 'delivered',
      },
    ],
    fetchedAt: 1,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  syncMock.clearCharacterSyncBookkeeping.mockImplementation(async () => {});
  syncMock.triggerSync.mockImplementation(async () => {});
  await Promise.all([
    db.characters.clear(),
    db.tokens.clear(),
    db.skillPlans.clear(),
    db.buildPlans.clear(),
    db.quickbars.clear(),
    db.stationPins.clear(),
    db.esiCache.clear(),
    db.settings.clear(),
    db.payees.clear(),
    db.miningTaxAssignments.clear(),
    db.orderProblemSamples.clear(),
    db.mailDrafts.clear(),
    db.miningLedgerHistory.clear(),
    db.industryJobHistory.clear(),
    db.netWorthSnapshots.clear(),
  ]);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});

describe('removeCharacter', () => {
  it('wipes the Character’s officer-only Corp Tax Book copy and no other Character’s', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    for (const characterId of [1, 2]) {
      await db.corpBookObserved.add({
        characterId,
        corporationId: 9,
        id: 'a',
        row: {},
        updatedMs: 1,
      });
      await db.corpBookObservedMeta.add({
        characterId,
        corporationId: 9,
        version: 'v',
        checkedAt: 1,
        fullAt: 1,
        watermark: 1,
      });
      await db.corpBookParts.add({
        characterId,
        corporationId: 9,
        slot: 'miners',
        version: 'v',
        at: 1,
        data: [],
      });
    }

    await removeCharacter(1);

    expect((await db.corpBookObserved.toArray()).map((r) => r.characterId)).toEqual([2]);
    expect((await db.corpBookObservedMeta.toArray()).map((r) => r.characterId)).toEqual([2]);
    expect((await db.corpBookParts.toArray()).map((r) => r.characterId)).toEqual([2]);
  });

  it('deletes the Character’s Firebase app and session when sync is configured', async () => {
    syncStatus.configured = true;
    try {
      await seedCharacter(1);
      await removeCharacter(1);
      expect(syncMock.removeCharacterSession).toHaveBeenCalledWith(1);
    } finally {
      syncStatus.configured = false;
    }
  });

  it('leaves Firebase alone when sync is not configured', async () => {
    await seedCharacter(1);
    await removeCharacter(1);
    expect(syncMock.removeCharacterSession).not.toHaveBeenCalled();
  });

  it('re-uploads the remaining roster, without unregistering, while Characters remain', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await removeCharacter(1);
    expect(pushMock.scheduleProjectionRebuild).toHaveBeenCalledTimes(1);
    expect(pushMock.unregisterProjectionRegistration).not.toHaveBeenCalled();
  });

  it('cancels the pending rebuild and unregisters push when the last Character is removed', async () => {
    await seedCharacter(1);
    await removeCharacter(1);
    expect(pushMock.scheduleProjectionRebuild.cancel).toHaveBeenCalledTimes(1);
    expect(pushMock.unregisterProjectionRegistration).toHaveBeenCalledTimes(1);
    expect(pushMock.scheduleProjectionRebuild).not.toHaveBeenCalled();
  });

  it('deletes every local row for the character', async () => {
    await seedCharacter(1);

    await removeCharacter(1);

    expect(await db.characters.get(1)).toBeUndefined();
    expect(await db.tokens.get(1)).toBeUndefined();
    expect(await db.skillPlans.where('characterId').equals(1).count()).toBe(0);
    expect(await db.buildPlans.where('characterId').equals(1).count()).toBe(0);
    expect(await db.quickbars.where('characterId').equals(1).count()).toBe(0);
    expect(await db.stationPins.where('characterId').equals(1).count()).toBe(0);
    expect(await db.esiCache.where('[characterId+key]').equals([1, 'wallet']).count()).toBe(0);
    expect(await db.payees.where('characterId').equals(1).count()).toBe(0);
    expect(await db.miningTaxAssignments.where('characterId').equals(1).count()).toBe(0);
    expect(await db.orderProblemSamples.where('characterId').equals(1).count()).toBe(0);
    expect(await db.mailDrafts.where('characterId').equals(1).count()).toBe(0);
    expect(await db.miningLedgerHistory.get(1)).toBeUndefined();
    expect(await db.industryJobHistory.get(1)).toBeUndefined();
    expect(await db.walletJournalArchive.where('characterId').equals(1).count()).toBe(0);
    expect(await db.walletTransactionArchive.where('characterId').equals(1).count()).toBe(0);
    expect(await db.walletArchiveCoverage.where('characterId').equals(1).count()).toBe(0);
    expect(await db.netWorthSnapshots.where('characterId').equals(1).count()).toBe(0);
  });

  it('deletes every synced collection’s local rows, Production Log included', async () => {
    await seedCharacter(1);
    for (const [table, record] of Object.entries(FULL_RECORDS)) {
      await db.table(table).put(record);
    }

    await removeCharacter(1);

    for (const c of EDITABLE_COLLECTIONS) {
      const left = await db.table(c.table).where('characterId').equals(1).count();
      expect({ [c.table]: left }).toEqual({ [c.table]: 0 });
    }
  });

  it('does not touch another character’s data', async () => {
    await seedCharacter(1);
    await seedCharacter(2);

    await removeCharacter(1);

    expect(await db.characters.get(2)).toBeDefined();
    expect(await db.skillPlans.where('characterId').equals(2).count()).toBe(1);
    expect(await db.payees.where('characterId').equals(2).count()).toBe(1);
    expect(await db.miningTaxAssignments.where('characterId').equals(2).count()).toBe(1);
    expect(await db.orderProblemSamples.where('characterId').equals(2).count()).toBe(1);
    expect(await db.mailDrafts.where('characterId').equals(2).count()).toBe(1);
    expect(await db.miningLedgerHistory.get(2)).toBeDefined();
    expect(await db.industryJobHistory.get(2)).toBeDefined();
    expect(await db.netWorthSnapshots.where('characterId').equals(2).count()).toBe(1);
  });

  it("deletes the removed Character's saved Community snapshots and no one else's", async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await db.settings.bulkPut([
      { key: 'communitySnapshot:1:list', value: [] },
      { key: 'communitySnapshot:1:members:c1', value: [] },
      { key: 'communitySnapshot:2:list', value: [] },
    ]);

    await removeCharacter(1);

    const keys = (await db.settings.toArray()).map((row) => row.key);
    expect(keys.filter((key) => key.startsWith('communitySnapshot:'))).toEqual([
      'communitySnapshot:2:list',
    ]);
  });

  it('leaves remote sync data to the inactivity purge: no remote call, no pending marker', async () => {
    await seedCharacter(1);

    await removeCharacter(1);

    // The `@/sync` mock exposes no remote purge — calling one would throw.
    expect(syncMock.clearCharacterSyncBookkeeping).toHaveBeenCalledWith(1);
    const keys = (await db.settings.toArray()).map((row) => row.key);
    expect(keys.filter((key) => key.startsWith('remotePurgePending.'))).toEqual([]);
    expect(await db.characters.get(1)).toBeUndefined();
  });

  it('removes the local rows all-or-nothing: a failed step leaves every row in place', async () => {
    await seedCharacter(1);
    syncMock.clearCharacterSyncBookkeeping.mockRejectedValueOnce(new Error('disk full'));

    await expect(removeCharacter(1)).rejects.toThrow('disk full');

    expect(await db.characters.get(1)).toBeDefined();
    expect(await db.tokens.get(1)).toBeDefined();
    expect(await db.skillPlans.where('characterId').equals(1).count()).toBe(1);
    expect(await db.mailDrafts.where('characterId').equals(1).count()).toBe(1);
    expect(await db.miningLedgerHistory.get(1)).toBeDefined();
  });

  it('reassigns the active character when the removed one was active', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await useActiveCharacter.getState().setActiveCharacter(1);

    await removeCharacter(1);

    expect(useActiveCharacter.getState().activeCharacterId).toBe(2);
  });

  it('clears the active selection when the removed character was the last one', async () => {
    await seedCharacter(1);
    await useActiveCharacter.getState().setActiveCharacter(1);

    await removeCharacter(1);

    expect(useActiveCharacter.getState().activeCharacterId).toBeNull();
  });

  it('leaves the active-character selection untouched when removing a different character', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await useActiveCharacter.getState().setActiveCharacter(2);

    await removeCharacter(1);

    expect(useActiveCharacter.getState().activeCharacterId).toBe(2);
  });

  it('purges the roster-shared structure cache once the last Character is removed', async () => {
    await seedCharacter(1);
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: 'structure:1000000000001',
      value: { name: 'Shared By The Roster' },
      fetchedAt: 1,
    });

    await removeCharacter(1);

    expect(
      await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, 'structure:1000000000001'])
    ).toBeUndefined();
  });

  it('leaves the shared structure cache intact while another Character remains in the roster', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await db.esiCache.put({
      characterId: GLOBAL_CACHE_CHARACTER_ID,
      key: 'structure:1000000000001',
      value: { name: 'Shared By The Roster' },
      fetchedAt: 1,
    });

    await removeCharacter(1);

    expect(
      (await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, 'structure:1000000000001']))?.value
    ).toEqual({ name: 'Shared By The Roster' });
  });
});

describe('removeCharacterAfterSync', () => {
  it("deletes the Character's Alerts Grant before removing it, and removes even if that fails", async () => {
    await seedCharacter(1);
    alertsApi.deleteAlertGrantRemote.mockImplementationOnce(async () => {
      expect(await db.characters.get(1)).toBeDefined();
      throw new Error('offline');
    });

    await removeCharacterAfterSync(1, true);

    expect(alertsApi.deleteAlertGrantRemote).toHaveBeenCalledExactlyOnceWith(1);
    expect(await db.characters.get(1)).toBeUndefined();
  });

  it('asks the server for no grant deletion when sync is not configured', async () => {
    await seedCharacter(1);
    alertsApi.deleteAlertGrantRemote.mockClear();

    await removeCharacterAfterSync(1, false);

    expect(alertsApi.deleteAlertGrantRemote).not.toHaveBeenCalled();
  });

  it('pushes the Character once before removing it when sync is configured', async () => {
    await seedCharacter(1);
    syncMock.triggerSync.mockImplementation(async () => {
      expect(await db.characters.get(1)).toBeDefined();
    });

    await removeCharacterAfterSync(1, true);

    expect(syncMock.triggerSync).toHaveBeenCalledExactlyOnceWith(1);
    expect(await db.characters.get(1)).toBeUndefined();
  });

  it('removes locally even when that push fails', async () => {
    await seedCharacter(1);
    syncMock.triggerSync.mockRejectedValueOnce(new Error('offline'));

    await removeCharacterAfterSync(1, true);

    expect(await db.characters.get(1)).toBeUndefined();
  });

  it('does not push when sync is not configured', async () => {
    await seedCharacter(1);

    await removeCharacterAfterSync(1, false);

    expect(syncMock.triggerSync).not.toHaveBeenCalled();
    expect(await db.characters.get(1)).toBeUndefined();
  });
});
