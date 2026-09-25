import { describe, it, expect } from 'vitest';
import {
  CORP_ROSTER_COLUMN_IDS,
  CORP_ROSTER_DEFAULT_COLUMNS,
  useVisibleCorpRosterColumns,
} from './corpRosterColumns';

describe('corp roster columns', () => {
  it('offers a roles column', () => {
    expect(CORP_ROSTER_COLUMN_IDS).toContain('roles');
  });

  /** Issue #1766: a Director who never asked for roles sees the roster unchanged. */
  it('hides the roles column until the pilot turns it on', () => {
    expect(CORP_ROSTER_DEFAULT_COLUMNS).not.toContain('roles');
    expect(useVisibleCorpRosterColumns.getState().value).toEqual(CORP_ROSTER_DEFAULT_COLUMNS);
  });

  it('shows every other optional column by default', () => {
    expect(CORP_ROSTER_DEFAULT_COLUMNS).toEqual(
      CORP_ROSTER_COLUMN_IDS.filter((id) => id !== 'roles')
    );
  });
});
