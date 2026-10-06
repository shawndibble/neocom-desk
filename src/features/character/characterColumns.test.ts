import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  CHARACTER_COLUMN_IDS,
  DEFAULT_VISIBLE_CHARACTER_COLUMNS,
  VISIBLE_CHARACTER_COLUMNS_KEY,
  CHARACTER_COLUMNS_MIGRATED_KEY,
  availableCharacterColumns,
  migrateVisibleColumns,
  useVisibleCharacterColumns,
  useCharacterColumnsMigrated,
  visibleAvailableColumns,
  CHARACTER_VIEW_MODE_KEY,
  useCharacterViewMode,
} from './characterColumns';

beforeEach(async () => {
  await db.settings.clear();
  useVisibleCharacterColumns.setState({
    value: DEFAULT_VISIBLE_CHARACTER_COLUMNS,
    hydrated: false,
  });
  useCharacterViewMode.setState({ value: 'card', hydrated: false });
  useCharacterColumnsMigrated.setState({ value: false, hydrated: false });
});

describe('availableCharacterColumns', () => {
  it('includes spReady when monitoring is on', () => {
    expect(availableCharacterColumns(true, true)).toContain('spReady');
  });

  it('excludes spReady when monitoring is off', () => {
    expect(availableCharacterColumns(false, true)).not.toContain('spReady');
    expect(availableCharacterColumns(false, true)).toHaveLength(CHARACTER_COLUMN_IDS.length - 1);
  });

  it('includes group when at least one Group exists', () => {
    expect(availableCharacterColumns(true, true)).toContain('group');
  });

  it('excludes group when no Groups exist', () => {
    expect(availableCharacterColumns(true, false)).not.toContain('group');
    expect(availableCharacterColumns(true, false)).toHaveLength(CHARACTER_COLUMN_IDS.length - 1);
  });
});

describe('visibleAvailableColumns', () => {
  it('drops spReady from a stored preference while monitoring is off, without mutating the preference itself', () => {
    const stored = ['name', 'spReady', 'alerts'] as const;
    expect(visibleAvailableColumns(stored, false, true)).toEqual(['name', 'alerts']);
    // The stored array itself is untouched — only the render-time view is narrowed.
    expect(stored).toEqual(['name', 'spReady', 'alerts']);
  });

  it('keeps spReady once monitoring is back on', () => {
    const stored = ['name', 'spReady', 'alerts'] as const;
    expect(visibleAvailableColumns(stored, true, true)).toEqual(['name', 'spReady', 'alerts']);
  });

  it('drops group from a stored preference once the last Group is deleted', () => {
    const stored = ['name', 'group', 'alerts'] as const;
    expect(visibleAvailableColumns(stored, true, false)).toEqual(['name', 'alerts']);
  });
});

describe('migrateVisibleColumns', () => {
  it('appends group when it is missing', () => {
    expect(migrateVisibleColumns(['name', 'alerts'])).toEqual(['name', 'alerts', 'group']);
  });

  it('is a no-op once group is already present', () => {
    expect(migrateVisibleColumns(['name', 'group'])).toEqual(['name', 'group']);
  });
});

describe('useCharacterColumnsMigrated', () => {
  it('defaults to not migrated', async () => {
    await useCharacterColumnsMigrated.getState().hydrate();
    expect(useCharacterColumnsMigrated.getState().value).toBe(false);
  });

  it('persists once set', async () => {
    await useCharacterColumnsMigrated.getState().setValue(true);
    const row = await db.settings.get(CHARACTER_COLUMNS_MIGRATED_KEY);
    expect(row?.value).toBe(true);
  });
});

describe('useVisibleCharacterColumns', () => {
  it('drops the retired remove column from a stored list', async () => {
    await db.settings.put({ key: VISIBLE_CHARACTER_COLUMNS_KEY, value: ['name', 'remove'] });
    await useVisibleCharacterColumns.getState().hydrate();
    expect(useVisibleCharacterColumns.getState().value).toEqual(['name']);
  });

  it('defaults to the attention-signal columns', async () => {
    await useVisibleCharacterColumns.getState().hydrate();
    expect(useVisibleCharacterColumns.getState().value).toEqual(DEFAULT_VISIBLE_CHARACTER_COLUMNS);
  });

  it('persists a chosen set', async () => {
    await useVisibleCharacterColumns.getState().setValue(['name', 'wallet']);
    const row = await db.settings.get(VISIBLE_CHARACTER_COLUMNS_KEY);
    expect(row?.value).toEqual(['name', 'wallet']);
  });

  it('rejects an empty stored array rather than rendering a columnless table', async () => {
    await db.settings.put({ key: VISIBLE_CHARACTER_COLUMNS_KEY, value: [] });
    await useVisibleCharacterColumns.getState().hydrate();
    expect(useVisibleCharacterColumns.getState().value).toEqual(DEFAULT_VISIBLE_CHARACTER_COLUMNS);
  });
});

describe('useCharacterViewMode', () => {
  it('defaults to card view', async () => {
    await useCharacterViewMode.getState().hydrate();
    expect(useCharacterViewMode.getState().value).toBe('card');
  });

  it('persists table view once chosen', async () => {
    await useCharacterViewMode.getState().setValue('table');
    const row = await db.settings.get(CHARACTER_VIEW_MODE_KEY);
    expect(row?.value).toBe('table');
  });
});
