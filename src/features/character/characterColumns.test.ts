import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  CHARACTER_COLUMN_IDS,
  DEFAULT_VISIBLE_CHARACTER_COLUMNS,
  VISIBLE_CHARACTER_COLUMNS_KEY,
  availableCharacterColumns,
  useVisibleCharacterColumns,
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
});

describe('availableCharacterColumns', () => {
  it('includes spReady when monitoring is on', () => {
    expect(availableCharacterColumns(true)).toContain('spReady');
  });

  it('excludes spReady when monitoring is off', () => {
    expect(availableCharacterColumns(false)).not.toContain('spReady');
    expect(availableCharacterColumns(false)).toHaveLength(CHARACTER_COLUMN_IDS.length - 1);
  });
});

describe('visibleAvailableColumns', () => {
  it('drops spReady from a stored preference while monitoring is off, without mutating the preference itself', () => {
    const stored = ['name', 'spReady', 'alerts'] as const;
    expect(visibleAvailableColumns(stored, false)).toEqual(['name', 'alerts']);
    // The stored array itself is untouched — only the render-time view is narrowed.
    expect(stored).toEqual(['name', 'spReady', 'alerts']);
  });

  it('keeps spReady once monitoring is back on', () => {
    const stored = ['name', 'spReady', 'alerts'] as const;
    expect(visibleAvailableColumns(stored, true)).toEqual(['name', 'spReady', 'alerts']);
  });
});

describe('useVisibleCharacterColumns', () => {
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
