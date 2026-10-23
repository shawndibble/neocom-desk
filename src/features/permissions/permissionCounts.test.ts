import { describe, expect, it } from 'vitest';
import { SCOPE_GROUPS } from '@/esi/registry';
import { SCOPES, scopesForGroup } from '@/esi/scopes';
import {
  COUNTED_PERMISSIONS,
  countGrantedPermissions,
  orderForPicker,
  pickerTone,
} from './permissionCounts';

describe('countGrantedPermissions', () => {
  it('counts none for an empty grant, out of every Permission but Corporation', () => {
    expect(countGrantedPermissions([])).toEqual({ granted: 0, total: COUNTED_PERMISSIONS.length });
  });

  it('leaves Corporation out, granted or not', () => {
    const all = COUNTED_PERMISSIONS.flatMap((group) => [...scopesForGroup(group)]);
    expect(countGrantedPermissions(all)).toEqual({
      granted: COUNTED_PERMISSIONS.length,
      total: COUNTED_PERMISSIONS.length,
    });
    expect(countGrantedPermissions([...scopesForGroup('corp')]).granted).toBe(0);
  });

  it('counts a Permission when all of its scopes are held', () => {
    const [first] = COUNTED_PERMISSIONS;
    expect(countGrantedPermissions([...scopesForGroup(first)]).granted).toBeGreaterThanOrEqual(1);
  });

  it('does not count a Permission with one of its scopes missing', () => {
    const group = COUNTED_PERMISSIONS.find((g) => scopesForGroup(g).length > 1);
    if (group === undefined) return;
    const partial = scopesForGroup(group).slice(1);
    expect(countGrantedPermissions(partial).granted).toBe(
      COUNTED_PERMISSIONS.filter((g) => scopesForGroup(g).every((s) => partial.includes(s))).length
    );
  });

  it('counts every counted Permission for a grant of every scope', () => {
    const all = SCOPE_GROUPS.flatMap((group) => [...scopesForGroup(group)]);
    expect(countGrantedPermissions(all)).toEqual({
      granted: COUNTED_PERMISSIONS.length,
      total: COUNTED_PERMISSIONS.length,
    });
  });

  it('ignores Core Grant scopes, which belong to no Permission', () => {
    const base = countGrantedPermissions([...SCOPES]);
    expect(base.granted).toBeLessThan(base.total);
  });
});

describe('pickerTone', () => {
  it.each([
    [14, 14, 'success'],
    [9, 14, 'warning'],
    [3, 14, 'danger'],
  ])('%i of %i is %s', (granted, total, tone) => {
    expect(pickerTone({ granted, total })).toBe(tone);
  });
});

describe('orderForPicker', () => {
  const row = (characterId: number, name: string, granted: number) => ({
    characterId,
    name,
    granted,
    total: 14,
  });

  it('lists Characters that need Permissions first, fewest granted first, then the complete ones by name', () => {
    const { needs, complete } = orderForPicker([
      row(1, 'Zed', 14),
      row(2, 'Mid', 9),
      row(3, 'Low', 3),
      row(4, 'Abe', 14),
    ]);
    expect(needs.map((r) => r.name)).toEqual(['Low', 'Mid']);
    expect(complete.map((r) => r.name)).toEqual(['Abe', 'Zed']);
  });

  it('breaks a tie on granted count by name', () => {
    const { needs } = orderForPicker([row(1, 'Bea', 5), row(2, 'Ann', 5)]);
    expect(needs.map((r) => r.name)).toEqual(['Ann', 'Bea']);
  });
});
