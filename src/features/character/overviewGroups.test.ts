import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  OVERVIEW_GROUPS_SETTING_KEY,
  updateGroups,
  useOverviewGroups,
  type OverviewGroupsValue,
} from './overviewGroups';
import { addGroup } from './groups';

beforeEach(async () => {
  await db.settings.clear();
  useOverviewGroups.setState({ value: { groups: [], updatedAt: 0 }, hydrated: false });
});

describe('OVERVIEW_GROUPS_SETTING_KEY', () => {
  it('does not carry the sync. prefix — this is device-local, not Editable Data', () => {
    expect(OVERVIEW_GROUPS_SETTING_KEY.startsWith('sync.')).toBe(false);
  });
});

describe('useOverviewGroups', () => {
  it('starts empty and hydrates the default when nothing is stored', async () => {
    expect(useOverviewGroups.getState().value).toEqual({ groups: [], updatedAt: 0 });
    await useOverviewGroups.getState().hydrate();
    expect(useOverviewGroups.getState().hydrated).toBe(true);
    expect(useOverviewGroups.getState().value.groups).toEqual([]);
  });

  it('persists groupings to Dexie under the plain key', async () => {
    const value: OverviewGroupsValue = {
      groups: [{ id: 'g1', name: 'Alts', characterIds: [1, 2] }],
      updatedAt: 123,
    };
    await useOverviewGroups.getState().setValue(value);
    expect((await db.settings.get(OVERVIEW_GROUPS_SETTING_KEY))?.value).toEqual(value);
  });

  it('falls back to the default when the stored value is malformed', async () => {
    await db.settings.put({ key: OVERVIEW_GROUPS_SETTING_KEY, value: { garbage: true } });
    await useOverviewGroups.getState().hydrate();
    expect(useOverviewGroups.getState().value).toEqual({ groups: [], updatedAt: 0 });
  });

  it('rejects a stored group whose characterIds are not all numbers', async () => {
    await db.settings.put({
      key: OVERVIEW_GROUPS_SETTING_KEY,
      value: { groups: [{ id: 'g1', name: 'Bad', characterIds: ['x'] }], updatedAt: 1 },
    });
    await useOverviewGroups.getState().hydrate();
    expect(useOverviewGroups.getState().value).toEqual({ groups: [], updatedAt: 0 });
  });
});

describe('updateGroups', () => {
  it('applies a groups.ts mutator and stamps updatedAt on the whole value', () => {
    const before: OverviewGroupsValue = { groups: [], updatedAt: 1 };
    const after = updateGroups(
      before,
      (groups) => addGroup(groups, { id: 'g1', name: 'Alts', characterIds: [] }),
      500
    );
    expect(after).toEqual({
      groups: [{ id: 'g1', name: 'Alts', characterIds: [] }],
      updatedAt: 500,
    });
  });
});
