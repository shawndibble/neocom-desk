import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { FULL_RECORDS } from '@/sync/syncedCollectionFixtures';
import { EDITABLE_COLLECTIONS } from '@/sync/syncedCollections';
import { exportBackup, importBackup } from './io';

const PASSWORD = 'correct horse battery staple';

beforeEach(async () => {
  await Promise.all([
    db.characters.clear(),
    db.tokens.clear(),
    db.settings.clear(),
    db.skillPlans.clear(),
  ]);
});

describe('exportBackup / importBackup', () => {
  it('round-trips an empty device', async () => {
    const { contents } = await exportBackup(PASSWORD);
    const summary = await importBackup(contents, PASSWORD);
    expect(summary).toEqual({
      addedCharacterIds: [],
      skippedCharacterIds: [],
      addedSettingKeys: [],
      skippedSettingKeys: [],
    });
  });

  it('imports a new character with its token and editable data, and skips one already present', async () => {
    await db.characters.bulkAdd([
      { characterId: 1, name: 'Existing', ownerHash: 'h1', addedAt: 0 },
      { characterId: 2, name: 'Traveling', ownerHash: 'h2', addedAt: 0 },
    ]);
    await db.tokens.bulkAdd([
      { characterId: 1, accessToken: 'a1', refreshToken: 'r1', expiresAt: 0, scopes: [] },
      { characterId: 2, accessToken: 'a2', refreshToken: 'r2', expiresAt: 0, scopes: [] },
    ]);
    await db.skillPlans.bulkAdd([
      { id: 'p2', characterId: 2, name: 'Plan', entries: [], remapCount: 0 } as never,
    ]);

    const { contents } = await exportBackup(PASSWORD);

    await db.tokens.update(1, { refreshToken: 'still-r1-untouched' });
    await db.characters.delete(2);
    await db.tokens.delete(2);
    await db.skillPlans.delete('p2');

    const summary = await importBackup(contents, PASSWORD);

    expect(summary.skippedCharacterIds).toEqual([1]);
    expect(summary.addedCharacterIds).toEqual([2]);

    const token1 = await db.tokens.get(1);
    expect(token1?.refreshToken).toBe('still-r1-untouched');

    const char2 = await db.characters.get(2);
    expect(char2?.name).toBe('Traveling');
    const token2 = await db.tokens.get(2);
    expect(token2?.refreshToken).toBe('r2');
    const plans2 = await db.skillPlans.where('characterId').equals(2).toArray();
    expect(plans2).toHaveLength(1);
  });

  it('never fails on an Editable Data id the device already holds, and never overwrites it (M2)', async () => {
    await db.miningTaxPaymentLinks.clear();
    await db.characters.bulkAdd([{ characterId: 2, name: 'Alt', ownerHash: 'h2', addedAt: 0 }]);
    await db.tokens.bulkAdd([
      { characterId: 2, accessToken: 'a2', refreshToken: 'r2', expiresAt: 0, scopes: [] },
    ]);
    const link = { ...FULL_RECORDS.miningTaxPaymentLinks, characterId: 2, amount: 1 };
    await db.miningTaxPaymentLinks.put(link);
    const { contents } = await exportBackup(PASSWORD);
    await db.characters.delete(2);
    await db.tokens.delete(2);
    await db.miningTaxPaymentLinks.put({ ...link, characterId: 1, amount: 2 });

    expect((await importBackup(contents, PASSWORD)).addedCharacterIds).toEqual([2]);
    expect(await db.miningTaxPaymentLinks.get(link.id)).toMatchObject({
      characterId: 1,
      amount: 2,
    });
  });

  it('carries Overview character groups through a backup', async () => {
    const value = { groups: [{ id: 'g1', name: 'Miners', characterIds: [1, 2] }], updatedAt: 5 };
    await db.settings.put({ key: 'overviewGroups', value });
    const { contents } = await exportBackup(PASSWORD);
    await db.settings.clear();

    const summary = await importBackup(contents, PASSWORD);

    expect(summary.addedSettingKeys).toEqual(['overviewGroups']);
    expect((await db.settings.get('overviewGroups'))?.value).toEqual(value);
  });

  it('rejects the wrong password without writing anything', async () => {
    await db.characters.bulkAdd([{ characterId: 5, name: 'X', ownerHash: 'h', addedAt: 0 }]);
    const { contents } = await exportBackup(PASSWORD);
    await db.characters.delete(5);

    await expect(importBackup(contents, 'not-the-password')).rejects.toThrow();
    await expect(db.characters.get(5)).resolves.toBeUndefined();
  });

  it('rolls back the whole import if one write in the middle fails', async () => {
    await db.characters.bulkAdd([{ characterId: 3, name: 'New Alt', ownerHash: 'h3', addedAt: 0 }]);
    await db.tokens.bulkAdd([
      { characterId: 3, accessToken: 'a3', refreshToken: 'r3', expiresAt: 0, scopes: [] },
    ]);
    await db.skillPlans.bulkAdd([
      { id: 'conflict', characterId: 3, name: 'Plan', entries: [], remapCount: 0 } as never,
    ]);

    const { contents } = await exportBackup(PASSWORD);

    await db.characters.delete(3);
    await db.tokens.delete(3);
    await db.skillPlans.clear();
    const proto = Object.getPrototypeOf(db.skillPlans) as typeof db.skillPlans;
    const bulkAdd = proto.bulkAdd;
    const failing = vi.spyOn(proto, 'bulkAdd').mockImplementation(function (
      this: typeof db.skillPlans,
      ...args: Parameters<typeof bulkAdd>
    ) {
      if (this.name === 'skillPlans') return Promise.reject(new Error('quota')) as never;
      return bulkAdd.apply(this, args);
    });

    await expect(importBackup(contents, PASSWORD)).rejects.toThrow();

    await expect(db.characters.get(3)).resolves.toBeUndefined();
    await expect(db.tokens.get(3)).resolves.toBeUndefined();
    failing.mockRestore();
  });
});

describe('restoring an existing-format backup file', () => {
  const FIXTURE = readFileSync(new URL('./__fixtures__/backup-v1.json', import.meta.url), 'utf8');
  const FIXTURE_PASSWORD = 'fixture password';

  beforeEach(async () => {
    await Promise.all(EDITABLE_COLLECTIONS.map((c) => db.table(c.table).clear()));
  });

  it('restores the Character, its token and its synced settings', async () => {
    const summary = await importBackup(FIXTURE, FIXTURE_PASSWORD);

    expect(summary).toEqual({
      addedCharacterIds: [1],
      skippedCharacterIds: [],
      addedSettingKeys: ['sync.marketHub'],
      skippedSettingKeys: [],
    });
    expect((await db.characters.get(1))?.name).toBe('Fixture Pilot');
    expect((await db.tokens.get(1))?.refreshToken).toBe('fixture-refresh');
    expect((await db.settings.get('sync.marketHub'))?.value).toBe('amarr');
    expect(await db.settings.get('activeCharacterId')).toBeUndefined();
  });

  const LEGACY_OMISSIONS: Partial<Record<keyof typeof FULL_RECORDS, string[]>> = {
    miningTaxAssignments: ['oreLineValues', 'rawOrePriced', 'label', 'override', 'releasedTypeIds'],
    productionRuns: ['sourceJobId'],
    buildPlans: ['costIndexOverridePct', 'productSalePrice'],
    payees: ['entityKind', 'defaultSystems', 'archivedAt'],
  };
  const LEGACY_RESHAPES: Partial<Record<keyof typeof FULL_RECORDS, (record: unknown) => unknown>> =
    {
      miningTaxAssignments: (record) => {
        const { payment, ...rest } = record as MiningTaxAssignmentRecord;
        if (!payment) return record;
        const { journalLinks, contractLinks, ...paymentRest } = payment;
        return {
          ...rest,
          payment: {
            ...paymentRest,
            ...(journalLinks?.[0] ? { journalRefId: journalLinks[0].refId } : {}),
            ...(contractLinks?.[0] ? { contractId: contractLinks[0].refId } : {}),
          },
        };
      },
    };
  const POSTDATES_FIXTURE: ReadonlySet<string> = new Set([
    'netWorthSnapshots',
    'productionLosses',
    'characterAccelerators',
    'miningTaxPaymentLinks',
  ]);
  const LEGACY_EXPECTED_RECORDS = Object.fromEntries(
    Object.entries(FULL_RECORDS)
      .filter(([table]) => !POSTDATES_FIXTURE.has(table))
      .map(([table, record]) => [
        table,
        (LEGACY_RESHAPES[table as keyof typeof FULL_RECORDS] ?? ((r: unknown) => r))({
          ...record,
          ...Object.fromEntries(
            (LEGACY_OMISSIONS[table as keyof typeof FULL_RECORDS] ?? []).map((key) => [
              key,
              undefined,
            ])
          ),
        }),
      ])
  );

  it.each(Object.entries(LEGACY_EXPECTED_RECORDS))(
    'restores the %s row intact',
    async (table, record) => {
      await importBackup(FIXTURE, FIXTURE_PASSWORD);
      expect(await db.table(table).toArray()).toEqual([record]);
    }
  );

  it('restores a row into every Editable Data table the registry declares', async () => {
    await importBackup(FIXTURE, FIXTURE_PASSWORD);
    for (const c of EDITABLE_COLLECTIONS.filter((c) => !POSTDATES_FIXTURE.has(c.table))) {
      expect({ [c.table]: await db.table(c.table).count() }).toEqual({ [c.table]: 1 });
    }
  });
});
