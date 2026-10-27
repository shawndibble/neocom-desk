import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  SKILL_COMPARISONS_SETTING_KEY,
  useSkillComparisons,
  upsertComparison,
  removeComparison,
  resolveComparisonCharacterIds,
  type SkillComparisonsValue,
} from './comparisons';

beforeEach(async () => {
  await db.settings.clear();
  useSkillComparisons.setState({
    value: { items: [], updatedAt: 0 },
    hydrated: false,
  });
});

describe('SKILL_COMPARISONS_SETTING_KEY', () => {
  it('does not carry the sync. prefix — this is device-local, not Editable Data', () => {
    expect(SKILL_COMPARISONS_SETTING_KEY.startsWith('sync.')).toBe(false);
  });
});

describe('useSkillComparisons', () => {
  it('starts empty and hydrates the default when nothing is stored', async () => {
    expect(useSkillComparisons.getState().value).toEqual({ items: [], updatedAt: 0 });
    await useSkillComparisons.getState().hydrate();
    expect(useSkillComparisons.getState().hydrated).toBe(true);
    expect(useSkillComparisons.getState().value.items).toEqual([]);
  });

  it('persists a saved comparison to Dexie under the plain key', async () => {
    const value: SkillComparisonsValue = {
      items: [{ id: 'a', name: 'Miners', characterIds: [1, 2] }],
      updatedAt: 123,
    };
    await useSkillComparisons.getState().setValue(value);
    expect((await db.settings.get(SKILL_COMPARISONS_SETTING_KEY))?.value).toEqual(value);
  });

  it('falls back to the default when the stored value is malformed', async () => {
    await db.settings.put({ key: SKILL_COMPARISONS_SETTING_KEY, value: { garbage: true } });
    await useSkillComparisons.getState().hydrate();
    expect(useSkillComparisons.getState().value).toEqual({ items: [], updatedAt: 0 });
  });

  it('rejects a stored comparison whose characterIds are not all numbers', async () => {
    await db.settings.put({
      key: SKILL_COMPARISONS_SETTING_KEY,
      value: { items: [{ id: 'a', name: 'Bad', characterIds: ['x'] }], updatedAt: 1 },
    });
    await useSkillComparisons.getState().hydrate();
    expect(useSkillComparisons.getState().value).toEqual({ items: [], updatedAt: 0 });
  });
});

describe('upsertComparison', () => {
  it('appends a new comparison and stamps updatedAt', () => {
    const before: SkillComparisonsValue = { items: [], updatedAt: 1 };
    const after = upsertComparison(before, { id: 'a', name: 'Miners', characterIds: [1, 2] }, 500);
    expect(after).toEqual({
      items: [{ id: 'a', name: 'Miners', characterIds: [1, 2] }],
      updatedAt: 500,
    });
  });

  it('replaces an existing comparison with the same id rather than duplicating it', () => {
    const before: SkillComparisonsValue = {
      items: [{ id: 'a', name: 'Miners', characterIds: [1] }],
      updatedAt: 1,
    };
    const after = upsertComparison(
      before,
      { id: 'a', name: 'Miners (renamed)', characterIds: [1, 2] },
      500
    );
    expect(after.items).toEqual([{ id: 'a', name: 'Miners (renamed)', characterIds: [1, 2] }]);
  });
});

describe('removeComparison', () => {
  it('drops the matching comparison and stamps updatedAt', () => {
    const before: SkillComparisonsValue = {
      items: [
        { id: 'a', name: 'Miners', characterIds: [1] },
        { id: 'b', name: 'PvP', characterIds: [2] },
      ],
      updatedAt: 1,
    };
    const after = removeComparison(before, 'a', 500);
    expect(after).toEqual({ items: [{ id: 'b', name: 'PvP', characterIds: [2] }], updatedAt: 500 });
  });

  it('is a no-op on the item list when the id is not found', () => {
    const before: SkillComparisonsValue = {
      items: [{ id: 'a', name: 'Miners', characterIds: [1] }],
      updatedAt: 1,
    };
    expect(removeComparison(before, 'missing', 500).items).toEqual(before.items);
  });
});

describe('resolveComparisonCharacterIds', () => {
  it('keeps every character id that still exists', () => {
    const comparison = { id: 'a', name: 'Miners', characterIds: [1, 2, 3] };
    expect(resolveComparisonCharacterIds(comparison, new Set([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it('drops a character id that has since been removed, degrading rather than breaking', () => {
    const comparison = { id: 'a', name: 'Miners', characterIds: [1, 2, 3] };
    expect(resolveComparisonCharacterIds(comparison, new Set([1, 3]))).toEqual([1, 3]);
  });

  it('returns an empty list when every character in the comparison is gone', () => {
    const comparison = { id: 'a', name: 'Miners', characterIds: [1, 2] };
    expect(resolveComparisonCharacterIds(comparison, new Set())).toEqual([]);
  });
});
