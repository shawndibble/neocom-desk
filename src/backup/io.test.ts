import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
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

    // Simulate a fresh device that already has character 1 (e.g. re-imported
    // its own backup accidentally) but not character 2.
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

    // Fresh device: doesn't have character 3 yet, but already has an
    // unrelated skill plan whose id collides with the one in the backup —
    // the bulkAdd for `skillPlans` throws partway through the import, after
    // `characters`/`tokens` would already have been written outside a
    // transaction.
    await db.characters.delete(3);
    await db.tokens.delete(3);
    await db.skillPlans.clear();
    await db.skillPlans.bulkAdd([
      { id: 'conflict', characterId: 99, name: 'Unrelated', entries: [], remapCount: 0 } as never,
    ]);

    await expect(importBackup(contents, PASSWORD)).rejects.toThrow();

    // Nothing from the failed import was committed, including the character
    // and token writes that Dexie would otherwise have applied before
    // reaching the failing table.
    await expect(db.characters.get(3)).resolves.toBeUndefined();
    await expect(db.tokens.get(3)).resolves.toBeUndefined();
  });
});

/**
 * ADR 0014's file format is a promise to every backup already sitting in a
 * pilot's downloads folder. `__fixtures__/backup-v1.json` was written by the
 * export code as it stood before the synced-collection registry (issue
 * #2043), with one full row in every Editable Data table, so this fails if a
 * refactor stops restoring any table an existing file carries.
 */
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
    // Never exported in the first place: only allow-listed `sync.` keys travel.
    expect(await db.settings.get('activeCharacterId')).toBeUndefined();
  });

  /**
   * `FULL_RECORDS` is the live "one full row per table" fixture, reused here
   * for convenience — but `backup-v1.json` is frozen (see the file's own doc
   * comment above) while `FULL_RECORDS` keeps growing as tables gain new
   * optional fields. A field added to a record's type after the file was
   * captured legitimately isn't in it, so restoring the file can never
   * produce that field — comparing straight against `FULL_RECORDS` would
   * fail for that table forever, not because restore broke, but because the
   * frozen file predates the field. `LEGACY_OMISSIONS` lists exactly which
   * fields to drop from `FULL_RECORDS`' expectation, per table, for this one
   * test — `toEqual` treats an explicit `undefined` the same as the key being
   * absent, so this doesn't need a real delete.
   */
  const LEGACY_OMISSIONS: Partial<Record<keyof typeof FULL_RECORDS, string[]>> = {
    // oreLineValues (grilling session, 2026-09-27) postdates this fixture.
    miningTaxAssignments: ['oreLineValues'],
  };
  /**
   * Like `LEGACY_OMISSIONS`, but for a field that was *reshaped* rather than
   * merely added, so dropping it to `undefined` isn't enough — the frozen
   * fixture's raw row still carries the old shape verbatim. `payment`'s
   * single `journalRefId`/`contractId` became `journalLinks`/`contractLinks`
   * arrays (manual/retroactive wallet-transaction linking, 2026-09-27),
   * postdating this fixture the same way `oreLineValues` does.
   */
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
  const LEGACY_EXPECTED_RECORDS = Object.fromEntries(
    Object.entries(FULL_RECORDS).map(([table, record]) => [
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
    for (const c of EDITABLE_COLLECTIONS) {
      expect({ [c.table]: await db.table(c.table).count() }).toEqual({ [c.table]: 1 });
    }
  });
});
