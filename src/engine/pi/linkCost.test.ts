import { describe, it, expect } from 'vitest';
import { greatCircleKm, linksLoad, type LinkGeometry } from './linkCost';
import type { PiLinkSpec } from '@/sde/types';

/** The shipped Link type (2280) attributes, verified against the dump. */
const SPEC: PiLinkSpec = {
  cpu: 15,
  powergrid: 10,
  cpuPerKm: 0.2,
  powergridPerKm: 0.15,
  cpuLevelModifier: 1.4,
  powergridLevelModifier: 1.2,
};

describe('greatCircleKm', () => {
  it('is zero for a pin joined to itself', () => {
    const p = { latitude: 1.57, longitude: 5.97 };
    expect(greatCircleKm(p, p, 6_030)).toBe(0);
  });

  it('scales linearly with the planet, which is the whole reason radius ships', () => {
    // Two colonies of identical shape cost wildly different amounts purely
    // because their planets differ in size. This is the property that makes a
    // constant radius wrong rather than merely imprecise.
    const a = { latitude: 1.5826, longitude: 5.9771 };
    const b = { latitude: 1.5946, longitude: 5.9783 };
    expect(greatCircleKm(a, b, 85_400) / greatCircleKm(a, b, 6_030)).toBeCloseTo(85_400 / 6_030, 6);
  });

  it('treats latitude as a polar angle, not a signed latitude', () => {
    // ESI's pin latitudes cluster around pi/2 and run 0..pi, so they are
    // colatitude. Reading them as signed latitude would put a pin at 1.57 rad
    // near the pole instead of the equator and shrink every distance.
    const equatorA = { latitude: Math.PI / 2, longitude: 0 };
    const equatorB = { latitude: Math.PI / 2, longitude: 1 };
    // A quarter-turn along the equator on a unit-ish sphere: 1 rad * R.
    expect(greatCircleKm(equatorA, equatorB, 1_000)).toBeCloseTo(1_000, 6);
  });

  it('never returns NaN when floating point pushes the cosine past 1', () => {
    const p = { latitude: 0.5, longitude: 2 };
    expect(greatCircleKm({ ...p }, { ...p }, 10_000)).not.toBeNaN();
  });
});

describe('linksLoad', () => {
  /** Efa II: 12 links, 6,030 km planet. Real colony, from ESI. */
  const EFA_II: LinkGeometry[] = [
    [
      { latitude: 1.5703743696212769, longitude: 5.977902412414551 },
      { latitude: 1.570561170578003, longitude: 5.965033054351807 },
    ],
    [
      { latitude: 1.5825064182281494, longitude: 5.989307403564453 },
      { latitude: 1.5826666355133057, longitude: 5.977088451385498 },
    ],
    [
      { latitude: 1.5826666355133057, longitude: 5.977088451385498 },
      { latitude: 1.5946428775787354, longitude: 5.978272914886475 },
    ],
  ].map(([a, b]) => ({ a, b, level: 0 }));

  it('charges a base cost per link plus a per-km term', () => {
    const load = linksLoad([EFA_II[0]], 6_030, SPEC);
    const km = greatCircleKm(EFA_II[0].a, EFA_II[0].b, 6_030);
    expect(load.powergrid).toBeCloseTo(10 + km * 0.15, 6);
    expect(load.cpu).toBeCloseTo(15 + km * 0.2, 6);
  });

  it('adds up across every link', () => {
    const load = linksLoad(EFA_II, 6_030, SPEC);
    const km = EFA_II.reduce((sum, l) => sum + greatCircleKm(l.a, l.b, 6_030), 0);
    expect(load.powergrid).toBeCloseTo(3 * 10 + km * 0.15, 6);
  });

  it('is free when there are no links', () => {
    expect(linksLoad([], 6_030, SPEC)).toEqual({ cpu: 0, powergrid: 0 });
  });

  it('leaves a level-0 link unmodified, since the modifier is a power of the level', () => {
    const zero = linksLoad([{ ...EFA_II[0], level: 0 }], 6_030, SPEC);
    const km = greatCircleKm(EFA_II[0].a, EFA_II[0].b, 6_030);
    expect(zero.powergrid).toBeCloseTo(10 + km * 0.15, 6);
  });

  it('scales an upgraded link by the modifier once per level', () => {
    const km = greatCircleKm(EFA_II[0].a, EFA_II[0].b, 6_030);
    const two = linksLoad([{ ...EFA_II[0], level: 2 }], 6_030, SPEC);
    expect(two.powergrid).toBeCloseTo((10 + km * 0.15) * 1.2 ** 2, 6);
    expect(two.cpu).toBeCloseTo((15 + km * 0.2) * 1.4 ** 2, 6);
  });

  it('refuses a radius it cannot use rather than reporting links as free', () => {
    // A planet whose radius did not resolve must not silently cost nothing —
    // that is the uncharged-link bug this module exists to fix.
    expect(() => linksLoad(EFA_II, 0, SPEC)).toThrow(/radius/i);
    expect(() => linksLoad(EFA_II, Number.NaN, SPEC)).toThrow(/radius/i);
  });
});

describe('against the reported colony', () => {
  // Efa II and Efa IV, both read from ESI, with radii from the shipped
  // payload. The pilot reported both colonies as full; the check is that
  // neither is priced over its Command Center's 17,000 MW, and that the big
  // planet's links are what consume its headroom.
  it('keeps a real colony inside its Powergrid budget on a small planet', () => {
    const links = [
      [1.5703743696212769, 5.977902412414551, 1.570561170578003, 5.965033054351807],
      [1.5825064182281494, 5.989307403564453, 1.5826666355133057, 5.977088451385498],
      [1.5826666355133057, 5.977088451385498, 1.5946428775787354, 5.978272914886475],
      [1.5825064182281494, 5.989307403564453, 1.5949941873550415, 5.990920066833496],
      [1.5826666355133057, 5.977088451385498, 1.5703743696212769, 5.977902412414551],
      [1.5826666355133057, 5.977088451385498, 1.5828295946121216, 5.9648756980896],
      [1.5825064182281494, 5.989307403564453, 1.5703442096710205, 5.990045547485352],
      [1.5946428775787354, 5.978272914886475, 1.5951069593429565, 5.965721607208252],
      [1.5828295946121216, 5.9648756980896, 1.5951069593429565, 5.965721607208252],
      [1.5828295946121216, 5.9648756980896, 1.570561170578003, 5.965033054351807],
      [1.570561170578003, 5.965033054351807, 1.5710630416870117, 5.952234268188477],
      [1.5951069593429565, 5.965721607208252, 1.5954134464263916, 5.9532318115234375],
    ].map(([la, lo, lb, lob]) => ({
      a: { latitude: la, longitude: lo },
      b: { latitude: lb, longitude: lob },
      level: 0,
    }));

    const load = linksLoad(links, 6_030, SPEC);
    // Pins alone measured 15,900 MW of a 17,000 MW budget.
    expect(15_900 + load.powergrid).toBeLessThan(17_000);
    expect(load.powergrid).toBeGreaterThan(200);
  });

  it('shows the same colony shape costing far more on a bigger planet', () => {
    const a = { latitude: 1.4258815050125122, longitude: 5.561734199523926 };
    const b = { latitude: 1.4386814832687378, longitude: 5.5619120597839355 };
    const small = linksLoad([{ a, b, level: 0 }], 6_030, SPEC);
    const large = linksLoad([{ a, b, level: 0 }], 85_400, SPEC);
    expect(large.powergrid).toBeGreaterThan(small.powergrid * 5);
  });
});
