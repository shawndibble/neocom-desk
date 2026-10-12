import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { removeCharacter } from '@/features/character/removeCharacter';
import {
  deleteShareSelections,
  hasShareSelections,
  loadFittingsAll,
  loadShareChoice,
  loadShareSelection,
  saveFittingsAll,
  saveShareChoice,
  saveShareSelection,
} from './shareSelection';

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

describe('share choice storage', () => {
  it('reads an existing allowlist as a not-all choice', async () => {
    await saveShareSelection(1, 'c1', new Set([5, 3]));
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: false, allowed: new Set([3, 5]) });
  });

  it('round-trips share-all with its exclusions', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set([9, 4]) });
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: true, excluded: new Set([4, 9]) });
  });

  it('keeps share-all with no exclusions as a row, so it is still on', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    expect((await loadShareChoice(1, 'c1')).all).toBe(true);
  });

  it('turning share-all off leaves exactly the saved allowlist', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set([9]) });
    await saveShareChoice(1, 'c1', { all: false, allowed: new Set([5]) });
    expect(await loadShareChoice(1, 'c1')).toEqual({ all: false, allowed: new Set([5]) });
    expect(await db.settings.count()).toBe(1);
  });

  it('stores nothing for an empty allowlist', async () => {
    await saveShareChoice(1, 'c1', { all: false, allowed: new Set() });
    expect(await db.settings.count()).toBe(0);
  });

  it('counts share-all as sharing and deletes it with the Character', async () => {
    await saveShareChoice(1, 'c1', { all: true, excluded: new Set() });
    expect(await hasShareSelections([1])).toBe(true);
    await deleteShareSelections(1);
    expect(await db.settings.count()).toBe(0);
  });
});

describe('share-all Fittings storage', () => {
  it('is off until switched on', async () => {
    expect(await loadFittingsAll(1, 'c1')).toBeNull();
  });

  it('round-trips the Fittings stopped since it was switched on', async () => {
    await saveFittingsAll(1, 'c1', new Set(['saved-b', 'game-9']));
    expect(await loadFittingsAll(1, 'c1')).toEqual(new Set(['saved-b', 'game-9']));
  });

  it('stays on with nothing stopped', async () => {
    await saveFittingsAll(1, 'c1', new Set());
    expect(await loadFittingsAll(1, 'c1')).toEqual(new Set());
  });

  it('switches off by saving null, and is kept apart per Community', async () => {
    await saveFittingsAll(1, 'c1', new Set());
    await saveFittingsAll(1, 'c2', new Set());
    await saveFittingsAll(1, 'c1', null);
    expect(await loadFittingsAll(1, 'c1')).toBeNull();
    expect(await loadFittingsAll(1, 'c2')).not.toBeNull();
  });

  it('counts as sharing and goes with the Character', async () => {
    await saveFittingsAll(1, 'c1', new Set());
    expect(await hasShareSelections([1])).toBe(true);
    await deleteShareSelections(1);
    expect(await loadFittingsAll(1, 'c1')).toBeNull();
  });
});
