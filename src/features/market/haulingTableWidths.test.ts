import { describe, it, expect } from 'vitest';
import {
  HAULING_COMPACT_COLUMNS_REM,
  HAULING_HUB_COLUMN_REM,
  HAULING_ITEM_MIN_REM,
  TABLE_WIDTHS,
} from './haulingTableWidths';

describe('Hauling table → cards threshold', () => {
  it('keeps the Item column at least 11rem wide with one hub', () => {
    expect(TABLE_WIDTHS.oneHub.cards - HAULING_COMPACT_COLUMNS_REM).toBeGreaterThanOrEqual(
      HAULING_ITEM_MIN_REM
    );
  });

  it('keeps the Item column at least 11rem wide with any hub (extra hub column)', () => {
    expect(
      TABLE_WIDTHS.anyHub.cards - HAULING_COMPACT_COLUMNS_REM - HAULING_HUB_COLUMN_REM
    ).toBeGreaterThanOrEqual(HAULING_ITEM_MIN_REM);
  });
});
