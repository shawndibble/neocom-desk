import { describe, expect, it } from 'vitest';
import type { DisplayRow } from './groupRows';
import { extraDuplicateRow } from './duplicateRows';

const row = (key: string) => ({ key }) as unknown as DisplayRow;

describe('extraDuplicateRow', () => {
  it('picks the last listed Assignment that has a row to open', () => {
    const rows = [row('a1'), row('other'), row('a2')];
    expect(extraDuplicateRow(['a1', 'a2'], rows)).toBe(rows[2]);
  });

  it('falls back to whichever one is still in view', () => {
    const rows = [row('a1')];
    expect(extraDuplicateRow(['a1', 'a2'], rows)).toBe(rows[0]);
  });

  it('is undefined when none of them is in view, so no dead button is drawn', () => {
    expect(extraDuplicateRow(['a1', 'a2'], [row('other')])).toBeUndefined();
    expect(extraDuplicateRow(undefined, [row('a1')])).toBeUndefined();
    expect(extraDuplicateRow([], [row('a1')])).toBeUndefined();
  });
});
