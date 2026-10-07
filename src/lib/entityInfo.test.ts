import { describe, expect, it } from 'vitest';
import { entityInfoHref, formatEntityInfo, parseEntityInfo } from './entityInfo';

describe('formatEntityInfo', () => {
  it('writes kind-id', () => {
    expect(formatEntityInfo({ kind: 'character', id: 91 })).toBe('character-91');
    expect(formatEntityInfo({ kind: 'skill', id: 3300 })).toBe('skill-3300');
  });
});

describe('parseEntityInfo', () => {
  it('reads each kind from a search string', () => {
    expect(parseEntityInfo('?info=character-1')).toEqual({ kind: 'character', id: 1 });
    expect(parseEntityInfo('?info=corporation-98')).toEqual({ kind: 'corporation', id: 98 });
    expect(parseEntityInfo('?info=alliance-5')).toEqual({ kind: 'alliance', id: 5 });
    expect(parseEntityInfo('?info=skill-3300')).toEqual({ kind: 'skill', id: 3300 });
    expect(parseEntityInfo('?info=type-34')).toEqual({ kind: 'type', id: 34 });
  });

  it('writes and rejects item types', () => {
    expect(formatEntityInfo({ kind: 'type', id: 34 })).toBe('type-34');
    expect(parseEntityInfo('?info=type-0')).toBeNull();
    expect(parseEntityInfo('?info=type-x')).toBeNull();
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
