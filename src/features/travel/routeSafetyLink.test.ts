import { describe, expect, it } from 'vitest';
import { legPinsParam, routeViaHref } from './routeSafetyLink';

describe('legPinsParam', () => {
  const codec = legPinsParam();

  it('reads one token per leg, an empty one for a leg flown as planned', () => {
    expect(codec.parse('thera,,gates,4821')).toEqual(['thera', '', 'gates', '4821']);
    expect(codec.parse(null)).toEqual([]);
  });

  it('drops a token that names nothing to "not pinned"', () => {
    expect(codec.parse('<b>,turnur')).toEqual(['', 'turnur']);
  });

  it('writes nothing for legs past the last pin, and no key at all with none', () => {
    expect(codec.serialize(['', 'thera', '', ''])).toBe(',thera');
    expect(codec.serialize(['', ''])).toBeNull();
  });
});

describe('routeViaHref', () => {
  it('opens Route Safety from the origin, holes on, the hole pinned for the first leg', () => {
    expect(routeViaHref(30000142, 'abc12')).toBe('/travel/route?from=30000142&wh=1&pin=abc12');
  });
});
