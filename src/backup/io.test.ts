import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
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
