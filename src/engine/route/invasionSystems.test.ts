import { describe, expect, it } from 'vitest';
import { EDENCOM_SYSTEMS, TRIGLAVIAN_MINOR_VICTORY_SYSTEMS } from './invasionSystems';

/*
 * Pinned, because the sets are fixed since the invasion ended: a count that
 * moves is an edit to vendored game data, and should be one on purpose.
 */
describe('invasion systems', () => {
  it('holds the 137 EDENCOM systems (53 fortress, 84 minor victory)', () => {
    expect(EDENCOM_SYSTEMS).toHaveLength(137);
    expect(new Set(EDENCOM_SYSTEMS).size).toBe(137);
  });

  it('holds the 28 Triglavian minor-victory systems', () => {
    expect(TRIGLAVIAN_MINOR_VICTORY_SYSTEMS).toHaveLength(28);
    expect(new Set(TRIGLAVIAN_MINOR_VICTORY_SYSTEMS).size).toBe(28);
  });

  it('never puts one system in both', () => {
    const edencom = new Set(EDENCOM_SYSTEMS);
    expect(TRIGLAVIAN_MINOR_VICTORY_SYSTEMS.filter((id) => edencom.has(id))).toEqual([]);
  });
});
