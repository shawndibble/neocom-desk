import { describe, expect, it } from 'vitest';
import {
  availableOverviewColumns,
  DEFAULT_VISIBLE_OVERVIEW_COLUMNS,
  visibleAvailableColumns,
} from './overviewColumns';

describe('availableOverviewColumns', () => {
  it('offers every column when refining is on and more than one character is tracked', () => {
    expect(availableOverviewColumns(true, true)).toEqual([
      'character',
      'system',
      'volume',
      'rawValue',
      'refineValue',
      'oreBreakdown',
      'units',
      'pricing',
    ]);
  });

  it('drops refineValue when refining is off (issue #1281 gate)', () => {
    expect(availableOverviewColumns(false, true)).not.toContain('refineValue');
  });

  it('drops character when only one character is tracked', () => {
    expect(availableOverviewColumns(true, false)).not.toContain('character');
  });
});

describe('visibleAvailableColumns', () => {
  it('narrows the stored preference to what is actually offered right now', () => {
    const visible = ['character', 'refineValue', 'pricing'] as const;
    expect(visibleAvailableColumns(visible, false, true)).toEqual(['character', 'pricing']);
  });

  it('leaves the stored preference untouched when everything is available', () => {
    expect(visibleAvailableColumns(DEFAULT_VISIBLE_OVERVIEW_COLUMNS, true, true)).toEqual(
      DEFAULT_VISIBLE_OVERVIEW_COLUMNS
    );
  });
});
