import { describe, expect, it } from 'vitest';
import { parseSavedRoute, sameSavedRoute } from './savedRoute';

const route = { fromId: 1, stops: [2, 3], systems: [1, 5, 2, 3] };

describe('parseSavedRoute', () => {
  it('accepts a well-formed route', () => {
    expect(parseSavedRoute(route)).toEqual(route);
  });

  it('rejects anything that is not a whole route', () => {
    expect(parseSavedRoute(null)).toBeNull();
    expect(parseSavedRoute({ ...route, stops: [] })).toBeNull();
    expect(parseSavedRoute({ ...route, systems: [1, 'x'] })).toBeNull();
    expect(parseSavedRoute({ ...route, fromId: 0 })).toBeNull();
    expect(parseSavedRoute({ fromId: 1 })).toBeNull();
  });
});

describe('sameSavedRoute', () => {
  it('compares by content', () => {
    expect(sameSavedRoute(route, { ...route, stops: [...route.stops] })).toBe(true);
    expect(sameSavedRoute(route, { ...route, systems: [1, 2, 3] })).toBe(false);
    expect(sameSavedRoute(null, null)).toBe(true);
    expect(sameSavedRoute(route, null)).toBe(false);
  });
});
