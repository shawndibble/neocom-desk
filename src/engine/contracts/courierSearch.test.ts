import { describe, it, expect } from 'vitest';
import type { SpaceKind } from '@/engine/space';
import {
  filterCourierContracts,
  resolveCourierRoutes,
  type CourierEndpoint,
  type PublicCourierContractRow,
} from '@/engine/contracts/courierSearch';

const JITA = 60003760;
const AMARR = 60008494;
const STRUCTURE = 1035466617946;

const THE_FORGE = 10000002;
const DOMAIN = 10000043;

const JITA_SYSTEM = 30000142;
const AMARR_SYSTEM = 30002187;

const RANCER = 60011740;
const RANCER_SYSTEM = 30002809;
const SINQ_LAISON = 10000032;
/**
 * A wormhole end. Invented ids and an invented J-name: this file hand-builds
 * the endpoint map to exercise the *filter*, so the band is stated outright
 * rather than classified — and no real NPC station sits in J-space, so
 * borrowing real ids here would suggest a row the SDE cannot produce.
 */
const WORMHOLE_STATION = 69000001;
const WORMHOLE_SYSTEM = 69000002;
const WORMHOLE_REGION = 69000003;

const ENDPOINTS = new Map<number, CourierEndpoint>([
  [
    JITA,
    {
      locationId: JITA,
      name: 'Jita IV - Moon 4',
      systemName: 'Jita',
      systemId: JITA_SYSTEM,
      regionId: THE_FORGE,
      space: 'highsec',
      resolution: 'station',
      hasStargates: true,
    },
  ],
  [
    AMARR,
    {
      locationId: AMARR,
      name: 'Amarr VIII',
      systemName: 'Amarr',
      systemId: AMARR_SYSTEM,
      regionId: DOMAIN,
      space: 'highsec',
      resolution: 'station',
      hasStargates: true,
    },
  ],
  [
    RANCER,
    {
      locationId: RANCER,
      name: 'Rancer III - Moon 1',
      systemName: 'Rancer',
      systemId: RANCER_SYSTEM,
      regionId: SINQ_LAISON,
      space: 'lowsec',
      resolution: 'station',
      hasStargates: true,
    },
  ],
  [
    WORMHOLE_STATION,
    {
      locationId: WORMHOLE_STATION,
      name: 'Wormhole Refuge',
      systemName: 'J105443',
      systemId: WORMHOLE_SYSTEM,
      regionId: WORMHOLE_REGION,
      space: 'wormhole',
      resolution: 'station',
      hasStargates: true,
    },
  ],
]);

function row(overrides: Partial<PublicCourierContractRow> = {}): PublicCourierContractRow {
  return {
    contractId: 1,
    regionId: THE_FORGE,
    originLocationId: JITA,
    destinationLocationId: AMARR,
    reward: 10_000_000,
    volume: 50_000,
    collateral: 1_000_000_000,
    daysToComplete: 7,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    ...overrides,
  };
}

function routes(rows: PublicCourierContractRow[]) {
  return resolveCourierRoutes(rows, ENDPOINTS);
}

describe('resolveCourierRoutes', () => {
  it('names both ends of the haul from the endpoint index', () => {
    const [route] = routes([row()]);

    expect(route.origin).toEqual({
      locationId: JITA,
      name: 'Jita IV - Moon 4',
      systemName: 'Jita',
      systemId: JITA_SYSTEM,
      regionId: THE_FORGE,
      space: 'highsec',
      resolution: 'station',
      hasStargates: true,
    });
    expect(route.destination.name).toBe('Amarr VIII');
    expect(route.destination.regionId).toBe(DOMAIN);
  });

  it('leaves an unresolvable endpoint unnamed rather than inventing a name', () => {
    // A player structure: `stations.json` does not hold it, and resolving one
    // costs an ESI call per id against an ACL that usually refuses. The id is
    // what the UI shows; it is not a name.
    const [route] = routes([row({ destinationLocationId: STRUCTURE })]);

    expect(route.destination).toEqual({
      locationId: STRUCTURE,
      name: null,
      systemName: null,
      // No system either, so this haul has no measurable distance — the case
      // the jumps column renders as unavailable.
      systemId: null,
      regionId: null,
      // And no band: nothing local places it, so there is no security status
      // to classify. A space filter excludes it rather than guessing highsec.
      space: null,
      // Reached the fallback, which means this id was never in the index at
      // all — nothing was concluded about it, which is not the same as
      // concluding it is a player structure.
      resolution: 'unknown',
      hasStargates: null,
    });
  });

  it("falls back to the row's own region for an unresolvable origin", () => {
    // `regionId` on the row is the contract's region — where it was posted,
    // i.e. the pickup end — so an unnamed origin structure still places the
    // haul on the map, and the origin-region filter still sees it.
    const [route] = routes([row({ originLocationId: STRUCTURE, regionId: DOMAIN })]);

    expect(route.origin.name).toBeNull();
    expect(route.origin.regionId).toBe(DOMAIN);
  });
});

describe('filterCourierContracts', () => {
  const forgeToDomain = row({ contractId: 1 });
  const domainToForge = row({
    contractId: 2,
    regionId: DOMAIN,
    originLocationId: AMARR,
    destinationLocationId: JITA,
  });
  const all = routes([forgeToDomain, domainToForge]);

  function ids(filter: Parameters<typeof filterCourierContracts>[1]) {
    return filterCourierContracts(all, filter).map((route) => route.contractId);
  }

  it('passes every row when nothing is set', () => {
    expect(ids({})).toEqual([1, 2]);
  });

  it('narrows to hauls leaving one region', () => {
    expect(ids({ originRegionId: THE_FORGE })).toEqual([1]);
  });

  it('narrows to hauls arriving in one region', () => {
    expect(ids({ destinationRegionId: THE_FORGE })).toEqual([2]);
  });

  it('excludes a haul whose destination never resolved from a destination-region filter', () => {
    // Unknown is not a match: claiming an unresolved structure sits in the
    // asked-for region would put a haul on a route list it may not belong to.
    const unresolved = routes([row({ contractId: 3, destinationLocationId: STRUCTURE })]);

    expect(filterCourierContracts(unresolved, { destinationRegionId: DOMAIN })).toEqual([]);
  });

  it('keeps only hauls paying at least the reward floor', () => {
    const rows = routes([row({ contractId: 1, reward: 5_000_000 }), row({ contractId: 2 })]);

    expect(
      filterCourierContracts(rows, { minReward: 10_000_000 }).map((r) => r.contractId)
    ).toEqual([2]);
  });

  it('reads an absent collateral as none rather than as unknown', () => {
    // The snapshot omits the column when the contract asks for no collateral,
    // so a hauler capping what they will put up should still see it — it asks
    // for nothing, which is under every ceiling.
    const rows = routes([row({ contractId: 1, collateral: undefined })]);

    expect(filterCourierContracts(rows, { maxCollateral: 0 }).map((r) => r.contractId)).toEqual([
      1,
    ]);
  });

  it('drops a haul whose collateral exceeds the ceiling', () => {
    expect(ids({ maxCollateral: 500_000_000 })).toEqual([]);
  });

  it('keeps only hauls that fit the cargo ceiling', () => {
    const rows = routes([row({ contractId: 1, volume: 12_000 }), row({ contractId: 2 })]);

    expect(filterCourierContracts(rows, { maxVolume: 60_000 }).map((r) => r.contractId)).toEqual([
      1, 2,
    ]);
    expect(filterCourierContracts(rows, { maxVolume: 20_000 }).map((r) => r.contractId)).toEqual([
      1,
    ]);
  });

  it('keeps only hauls allowing at least the asked-for number of days', () => {
    const rows = routes([row({ contractId: 1, daysToComplete: 1 }), row({ contractId: 2 })]);

    expect(filterCourierContracts(rows, { minDaysToComplete: 3 }).map((r) => r.contractId)).toEqual(
      [2]
    );
  });

  it('passes a haul that states no deadline rather than excluding it on a number it does not carry', () => {
    // Same rule `contractSearch.ts` applies to an auction with no buyout: a
    // missing figure is unknowable, not disqualifying.
    const rows = routes([row({ contractId: 1, daysToComplete: undefined })]);

    expect(
      filterCourierContracts(rows, { minDaysToComplete: 30 }).map((r) => r.contractId)
    ).toEqual([1]);
  });

  it('matches a route query against either end, by station or system name', () => {
    expect(ids({ routeQuery: 'jita' })).toEqual([1, 2]);
    expect(ids({ routeQuery: 'amarr viii' })).toEqual([1, 2]);
  });

  it('treats a blank route query as no restriction', () => {
    expect(ids({ routeQuery: '   ' })).toEqual([1, 2]);
  });

  it('matches nothing when the route query names neither end', () => {
    expect(ids({ routeQuery: 'rens' })).toEqual([]);
  });

  it('combines every set filter', () => {
    expect(ids({ originRegionId: DOMAIN, minReward: 10_000_000, maxVolume: 50_000 })).toEqual([2]);
  });
});

/**
 * Endpoint security, never route security (issue #939). A highsec pickup and a
 * highsec delivery can still route through lowsec, and nothing here claims
 * otherwise — this narrows on where a haul *ends*, which is the one thing the
 * local snapshots can answer without a request per row.
 */
describe('filterCourierContracts — destination space', () => {
  const HAULS = [
    row({ contractId: 1, destinationLocationId: AMARR }),
    row({ contractId: 2, destinationLocationId: RANCER }),
    row({ contractId: 3, destinationLocationId: WORMHOLE_STATION }),
    // A player structure: nothing local places it, so it has no band at all.
    row({ contractId: 4, destinationLocationId: STRUCTURE }),
  ];

  function matching(destinationSpace: readonly SpaceKind[] | null) {
    return filterCourierContracts(routes(HAULS), { destinationSpace }).map((r) => r.contractId);
  }

  it('keeps only hauls ending in a chosen band', () => {
    expect(matching(['highsec'])).toEqual([1]);
    expect(matching(['lowsec'])).toEqual([2]);
    expect(matching(['wormhole'])).toEqual([3]);
  });

  it('accepts several bands at once', () => {
    expect(matching(['highsec', 'wormhole'])).toEqual([1, 3]);
  });

  it('excludes a destination nothing local places, rather than guessing a band', () => {
    // It already drops out of the destination-region filter for the same
    // reason. "Unknown" is not a band, and is certainly not "highsec".
    expect(matching(['highsec', 'lowsec', 'nullsec', 'wormhole'])).not.toContain(4);
  });

  it('treats an absent filter as no restriction, unplaced destinations included', () => {
    expect(matching(null)).toEqual([1, 2, 3, 4]);
    expect(filterCourierContracts(routes(HAULS), {}).map((r) => r.contractId)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('matches nothing when no band is chosen', () => {
    // Deselecting every band asks for hauls ending in none of them, which is
    // an empty answer — not a silent "show everything". The panel maps
    // all-selected to no filter at all, which is where "show everything" lives.
    expect(matching([])).toEqual([]);
  });
});
