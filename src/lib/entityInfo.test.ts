import { describe, expect, it } from 'vitest';
import { entityInfoHref, formatEntityInfo, parseEntityInfo } from './entityInfo';

describe('formatEntityInfo', () => {
  it('writes kind-id', () => {
    expect(formatEntityInfo({ kind: 'character', id: 91 })).toBe('character-91');
    expect(formatEntityInfo({ kind: 'skill', id: 3300 })).toBe('skill-3300');
    expect(formatEntityInfo({ kind: 'faction', id: 500001 })).toBe('faction-500001');
  });

  it('round-trips a faction and takes no item id on it', () => {
    const target = { kind: 'faction', id: 500001 } as const;
    expect(parseEntityInfo(`?info=${formatEntityInfo(target)}`)).toEqual(target);
    expect(parseEntityInfo('?info=faction-500001-2')).toBeNull();
    expect(parseEntityInfo('?info=faction-0')).toBeNull();
  });
});

describe('parseEntityInfo', () => {
  it('reads each kind from a search string', () => {
    expect(parseEntityInfo('?info=character-1')).toEqual({ kind: 'character', id: 1 });
    expect(parseEntityInfo('?info=corporation-98')).toEqual({ kind: 'corporation', id: 98 });
    expect(parseEntityInfo('?info=alliance-5')).toEqual({ kind: 'alliance', id: 5 });
    expect(parseEntityInfo('?info=faction-500001')).toEqual({ kind: 'faction', id: 500001 });
    expect(parseEntityInfo('?info=skill-3300')).toEqual({ kind: 'skill', id: 3300 });
    expect(parseEntityInfo('?info=type-34')).toEqual({ kind: 'type', id: 34 });
    expect(parseEntityInfo('?info=place-60003760')).toEqual({ kind: 'place', id: 60003760 });
    expect(parseEntityInfo('?info=place-1030000000000')).toEqual({
      kind: 'place',
      id: 1_030_000_000_000,
    });
  });

  it('takes no item id on a place', () => {
    expect(parseEntityInfo('?info=place-60003760-5')).toBeNull();
  });

  it('writes and rejects item types', () => {
    expect(formatEntityInfo({ kind: 'type', id: 34 })).toBe('type-34');
    expect(parseEntityInfo('?info=type-0')).toBeNull();
    expect(parseEntityInfo('?info=type-x')).toBeNull();
  });

  it('carries an owned item id on an item type only', () => {
    expect(formatEntityInfo({ kind: 'type', id: 47408, itemId: 1040000000001 })).toBe(
      'type-47408-1040000000001'
    );
    expect(parseEntityInfo('?info=type-47408-1040000000001')).toEqual({
      kind: 'type',
      id: 47408,
      itemId: 1040000000001,
    });
    expect(parseEntityInfo('?info=type-47408-0')).toBeNull();
    expect(parseEntityInfo('?info=character-1-2')).toBeNull();
    expect(parseEntityInfo('?info=type-47408-99999999999999999999')).toBeNull();
  });

  it('accepts a search without the leading ? and finds it among other params', () => {
    expect(parseEntityInfo('tab=a&info=skill-7&x=1')).toEqual({ kind: 'skill', id: 7 });
  });

  it('is null when absent or unreadable', () => {
    expect(parseEntityInfo('')).toBeNull();
    expect(parseEntityInfo('?tab=a')).toBeNull();
    expect(parseEntityInfo('?info=')).toBeNull();
    expect(parseEntityInfo('?info=character-')).toBeNull();
    expect(parseEntityInfo('?info=character-0')).toBeNull();
    expect(parseEntityInfo('?info=character-1.5')).toBeNull();
    expect(parseEntityInfo('?info=character-abc')).toBeNull();
    expect(parseEntityInfo('?info=station-1')).toBeNull();
    expect(parseEntityInfo('?info=character-99999999999999999999')).toBeNull();
  });
});

describe('entityInfoHref', () => {
  it('sets info on a location with no search', () => {
    expect(
      entityInfoHref({ pathname: '/contracts', search: '' }, { kind: 'character', id: 1 })
    ).toBe('/contracts?info=character-1');
  });

  it('keeps the other params', () => {
    expect(
      entityInfoHref(
        { pathname: '/market/browser', search: '?type=34&hub=jita' },
        { kind: 'skill', id: 3300 }
      )
    ).toBe('/market/browser?type=34&hub=jita&info=skill-3300');
  });

  it('replaces an info already there', () => {
    expect(
      entityInfoHref(
        { pathname: '/x', search: '?info=character-1&a=b' },
        { kind: 'corporation', id: 2 }
      )
    ).toBe('/x?info=corporation-2&a=b');
  });
});
