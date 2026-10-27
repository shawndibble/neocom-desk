import { describe, expect, it } from 'vitest';
import { legPinsParam, pinFirstLeg, routeToHref } from './routeSafetyLink';

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

describe('pinFirstLeg', () => {
  it('pins the first leg to the hole', () => {
    expect(pinFirstLeg([], 'abc12')).toEqual(['abc12']);
  });

  it('replaces the first leg only, keeping the later legs pins', () => {
    expect(pinFirstLeg(['thera', '', 'gates'], 'abc12')).toEqual(['abc12', '', 'gates']);
  });

  it('does not change the pins it is given', () => {
    const pins = ['gates'];
    pinFirstLeg(pins, 'abc12');
    expect(pins).toEqual(['gates']);
  });
});

describe('routeToHref', () => {
  it('opens Route Safety to the system, leaving the start to the page (the current system)', () => {
    expect(routeToHref(30000142)).toBe('/travel/route?stops=30000142');
    expect(routeToHref(30000142, null, null, 60003760)).toBe(
      '/travel/route?stops=30000142%3A60003760'
    );
  });

  it("carries the page's own route preference, so the route opens the way the count was worked out", () => {
    expect(routeToHref(30000142, null, 'shortest')).toBe(
      '/travel/route?pref=shortest&stops=30000142'
    );
    expect(routeToHref(30000142, null, 'prefer-highsec')).toContain('pref=prefer-highsec');
  });

  it('names the start when the count is measured from somewhere else', () => {
    expect(routeToHref(30000142, 30002187)).toBe('/travel/route?from=30002187&stops=30000142');
  });
});
