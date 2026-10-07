import { describe, expect, it } from 'vitest';
import { LAWLESS_STALE_AFTER_MS, freshLawlessSystems } from './lawless';

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);

describe('freshLawlessSystems', () => {
  it('returns the listed systems while the snapshot is fresh', () => {
    const doc = { systemIds: [30045339, 30045341], updatedAt: NOW - 5 * 60_000 };
    expect(freshLawlessSystems(doc, NOW)).toEqual(new Set([30045339, 30045341]));
  });

  it('still counts a snapshot exactly at the limit', () => {
    const doc = { systemIds: [1], updatedAt: NOW - LAWLESS_STALE_AFTER_MS };
    expect(freshLawlessSystems(doc, NOW)).toEqual(new Set([1]));
  });

  it('shows nothing once the snapshot is past the limit', () => {
    const doc = { systemIds: [1], updatedAt: NOW - LAWLESS_STALE_AFTER_MS - 1 };
    expect(freshLawlessSystems(doc, NOW).size).toBe(0);
  });

  it('shows nothing for a missing snapshot', () => {
    expect(freshLawlessSystems(null, NOW).size).toBe(0);
    expect(freshLawlessSystems(undefined, NOW).size).toBe(0);
  });

  it('shows nothing for a malformed snapshot', () => {
    expect(freshLawlessSystems({ systemIds: 'x', updatedAt: NOW }, NOW).size).toBe(0);
    expect(freshLawlessSystems({ systemIds: [1] }, NOW).size).toBe(0);
    expect(freshLawlessSystems({ systemIds: [1], updatedAt: 'now' }, NOW).size).toBe(0);
  });

  it('drops entries that are not system ids', () => {
    const doc = { systemIds: [1, 'x', null, 2.5, 3], updatedAt: NOW };
    expect(freshLawlessSystems(doc, NOW)).toEqual(new Set([1, 3]));
  });

  it('shows nothing for a snapshot dated in the future', () => {
    const doc = { systemIds: [1], updatedAt: NOW + 60_000 };
    expect(freshLawlessSystems(doc, NOW).size).toBe(0);
  });
});
