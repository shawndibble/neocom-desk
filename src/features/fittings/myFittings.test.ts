import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  deleteFitting,
  loadFittings,
  renameFitting,
  saveFitting,
  setFittingNotes,
} from './myFittings';

const { scheduleSync, markFittingDeleted } = vi.hoisted(() => ({
  scheduleSync: vi.fn(),
  markFittingDeleted: vi.fn(),
}));
vi.mock('@/sync', () => ({ scheduleSync, markFittingDeleted }));

beforeEach(async () => {
  await db.fittings.clear();
  vi.clearAllMocks();
});

describe('My Fittings store', () => {
  it('saves only id, characterId, name, code and updatedAt, then schedules a sync', async () => {
    const saved = await saveFitting(7, { name: 'Kite', code: 'abc' });
    const rows = await loadFittings(7);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'characterId',
      'code',
      'id',
      'name',
      'updatedAt',
    ]);
    expect(rows[0]).toEqual(saved);
    expect(scheduleSync).toHaveBeenCalledWith(7);
  });

  it('saving again with the same id updates the record instead of adding one', async () => {
    const first = await saveFitting(7, { name: 'Kite', code: 'abc' });
    const second = await saveFitting(7, { id: first.id, name: 'Kite', code: 'def' });
    expect(second.id).toBe(first.id);
    expect(await loadFittings(7)).toHaveLength(1);
    expect((await loadFittings(7))[0]!.code).toBe('def');
  });

  it('only lists the given Character Fittings', async () => {
    await saveFitting(7, { name: 'Mine', code: 'a' });
    await saveFitting(8, { name: 'Theirs', code: 'b' });
    expect((await loadFittings(7)).map((f) => f.name)).toEqual(['Mine']);
  });

  it('renames without touching the code', async () => {
    const saved = await saveFitting(7, { name: 'Old', code: 'abc' });
    const renamed = await renameFitting(saved, 'New');
    expect(renamed).toMatchObject({ name: 'New', code: 'abc' });
    expect((await loadFittings(7))[0]!.name).toBe('New');
  });

  it('keeps notes across a rename and a re-save that names none', async () => {
    const saved = await saveFitting(7, { name: 'Old', code: 'abc', notes: 'Overheat late.' });
    const renamed = await renameFitting(saved, 'New');
    expect(renamed.notes).toBe('Overheat late.');
    const resaved = await saveFitting(7, { id: saved.id, name: 'New', code: 'def' });
    expect(resaved.notes).toBe('Overheat late.');
    expect((await loadFittings(7))[0]!.notes).toBe('Overheat late.');
  });

  it('setFittingNotes replaces the notes, schedules a sync, and clears them when emptied', async () => {
    const saved = await saveFitting(7, { name: 'Kite', code: 'abc' });
    scheduleSync.mockClear();
    const noted = await setFittingNotes(saved, 'Kite the frigates.');
    expect(noted.notes).toBe('Kite the frigates.');
    expect(noted.updatedAt).toBeGreaterThanOrEqual(saved.updatedAt);
    expect(scheduleSync).toHaveBeenCalledWith(7);

    const cleared = await setFittingNotes(noted, '');
    expect(cleared).not.toHaveProperty('notes');
    expect((await loadFittings(7))[0]).not.toHaveProperty('notes');
  });

  it('keeps notes to what EVE will take as a description', async () => {
    const saved = await saveFitting(7, { name: 'Kite', code: 'abc' });
    const noted = await setFittingNotes(saved, 'y'.repeat(600));
    expect(noted.notes).toHaveLength(500);
  });

  it('deletes through the tombstone path', async () => {
    const saved = await saveFitting(7, { name: 'Kite', code: 'abc' });
    await deleteFitting(saved);
    expect(markFittingDeleted).toHaveBeenCalledWith(7, saved.id);
  });
});
