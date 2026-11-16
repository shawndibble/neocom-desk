import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { dayKey, hideNotPaying, readNotPaying, showNotPaying, uncreditedKey } from './notPaying';

describe('not paying, on this device', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('hides and shows again by key', async () => {
    await hideNotPaying(dayKey(1, 7, '2026-11-06'));
    expect(await readNotPaying()).toEqual(new Set(['day:1:7:2026-11-06']));
    await showNotPaying(dayKey(1, 7, '2026-11-06'));
    expect(await readNotPaying()).toEqual(new Set());
  });

  // A donation that becomes uncredited after the member hid the others is a new problem.
  it('keys uncredited donations by when they were sent, in any order', () => {
    expect(uncreditedKey(1, ['b', 'a'])).toBe(uncreditedKey(1, ['a', 'b']));
    expect(uncreditedKey(1, ['a'])).not.toBe(uncreditedKey(1, ['a', 'b']));
  });

  it('reads nothing rather than failing on a malformed store', async () => {
    await db.settings.put({ key: 'miningTaxNotPaying', value: 'nope' });
    expect(await readNotPaying()).toEqual(new Set());
  });
});
