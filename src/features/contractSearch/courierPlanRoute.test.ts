import { describe, expect, it } from 'vitest';
import type { CourierEndpoint } from '@/engine/contracts/courierSearch';
import { courierPlanRouteHref } from './courierPlanRoute';

function end(over: Partial<CourierEndpoint>): CourierEndpoint {
  return {
    locationId: 60003760,
    name: 'Jita IV - Moon 4',
    systemName: 'Jita',
    systemId: 30000142,
    regionId: 10000002,
    security: 0.9,
    space: 'highsec',
    resolution: 'station',
    hasStargates: true,
    ...over,
  };
}

describe('courierPlanRouteHref', () => {
  it('opens Route Safety with pickup then drop-off, stations and preference, no from', () => {
    const href = courierPlanRouteHref(
      end({}),
      end({ locationId: 60008494, systemId: 30002187 }),
      'prefer-highsec'
    );
    expect(href).toBe(
      '/travel/route?pref=prefer-highsec&stops=30000142%3A60003760%2C30002187%3A60008494'
    );
  });

  it('is null when either end has no solar system', () => {
    expect(courierPlanRouteHref(end({ systemId: null }), end({}), 'shortest')).toBeNull();
    expect(courierPlanRouteHref(end({}), end({ systemId: null }), 'shortest')).toBeNull();
  });

  it('uses a single stop when both ends share a system (Route Safety keeps each system once)', () => {
    const href = courierPlanRouteHref(end({}), end({ locationId: 60000001 }), 'shortest');
    expect(href).toBe('/travel/route?pref=shortest&stops=30000142%3A60003760');
  });

  it('leaves the station off an end that nothing local names', () => {
    const href = courierPlanRouteHref(
      end({ resolution: 'unknown', name: null, locationId: 1_000_000_000_001 }),
      end({ locationId: 60008494, systemId: 30002187 }),
      'shortest'
    );
    expect(href).toBe('/travel/route?pref=shortest&stops=30000142%2C30002187%3A60008494');
  });
});
