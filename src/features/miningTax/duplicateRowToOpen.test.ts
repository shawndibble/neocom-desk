import { describe, expect, it } from 'vitest';
import type { DisplayRow } from './groupRows';
import { duplicateRowToOpen } from './duplicateRowToOpen';

const row = (key: string) => ({ key }) as unknown as DisplayRow;
const combined = (key: string) => ({ key, groupMembers: [{}, {}] }) as unknown as DisplayRow;

describe('duplicateRowToOpen', () => {
  it('picks the last listed Assignment that has a row to open', () => {
    const rows = [row('a1'), row('other'), row('a2')];
    expect(duplicateRowToOpen(['a1', 'a2'], rows)).toBe(rows[2]);
  });

  it('falls back to whichever one is still in view', () => {
    const rows = [row('a1')];
    expect(duplicateRowToOpen(['a1', 'a2'], rows)).toBe(rows[0]);
  });

  it('refuses a Combined Entry, so the button never promises less than it does', () => {
    expect(duplicateRowToOpen(['a1'], [combined('a1')])).toBeUndefined();
    const rows = [row('a1'), combined('a2')];
    expect(duplicateRowToOpen(['a1', 'a2'], rows)).toBe(rows[0]);
  });

  it('is undefined when none of them is in view, so no dead button is drawn', () => {
    expect(duplicateRowToOpen(['a1', 'a2'], [row('other')])).toBeUndefined();
    expect(duplicateRowToOpen(undefined, [row('a1')])).toBeUndefined();
    expect(duplicateRowToOpen([], [row('a1')])).toBeUndefined();
  });
});
