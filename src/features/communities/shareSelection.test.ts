import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { removeCharacter } from '@/features/character/removeCharacter';
import { deleteShareSelections, loadShareSelection, saveShareSelection } from './shareSelection';

beforeEach(async () => {
  await db.settings.clear();
});

describe('share selection storage', () => {
  it('shares nothing until a choice is saved', async () => {
    expect((await loadShareSelection(1, 'c1')).size).toBe(0);
  });

  it('keeps each Character and Community apart', async () => {
    await saveShareSelection(1, 'c1', new Set([5, 3]));
    await saveShareSelection(1, 'c2', new Set([9]));
    await saveShareSelection(2, 'c1', new Set([7]));
    expect([...(await loadShareSelection(1, 'c1'))]).toEqual([3, 5]);
    expect([...(await loadShareSelection(1, 'c2'))]).toEqual([9]);
    expect([...(await loadShareSelection(2, 'c1'))]).toEqual([7]);
  });

  it('drops the row when the choice is emptied', async () => {
    await saveShareSelection(1, 'c1', new Set([5]));
    await saveShareSelection(1, 'c1', new Set());
    expect(await db.settings.count()).toBe(0);
  });

  it('ignores a malformed stored value', async () => {
    await db.settings.put({ key: 'communityShare:1:c1', value: 'nope' });
    expect((await loadShareSelection(1, 'c1')).size).toBe(0);
  });

  it('deletes only the given Character’s choices', async () => {
    await saveShareSelection(1, 'c1', new Set([5]));
    await saveShareSelection(12, 'c1', new Set([6]));
    await deleteShareSelections(1);
    expect((await loadShareSelection(1, 'c1')).size).toBe(0);
    expect((await loadShareSelection(12, 'c1')).size).toBe(1);
  });

  it('is cleared when the Character is removed', async () => {
    await db.characters.put({ characterId: 1, name: 'A', ownerHash: 'h', addedAt: 1 });
    await saveShareSelection(1, 'c1', new Set([5]));
    await removeCharacter(1, false);
    expect((await loadShareSelection(1, 'c1')).size).toBe(0);
  });
});
