import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
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

  it.each(Object.entries(FULL_RECORDS))('restores the %s row intact', async (table, record) => {
    await importBackup(FIXTURE, FIXTURE_PASSWORD);
    expect(await db.table(table).toArray()).toEqual([record]);
  });

  it('restores a row into every Editable Data table the registry declares', async () => {
    await importBackup(FIXTURE, FIXTURE_PASSWORD);
    for (const c of EDITABLE_COLLECTIONS) {
      expect({ [c.table]: await db.table(c.table).count() }).toEqual({ [c.table]: 1 });
    }
  });
});
