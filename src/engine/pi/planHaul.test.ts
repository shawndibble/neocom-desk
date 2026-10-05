import { describe, it, expect } from 'vitest';
import { HAUL_SHIPS, haulFit, routeExposure, haulSummary, type RouteSystem } from './planHaul';

const sys = (systemId: number, security: number | null): RouteSystem => ({ systemId, security });

describe('haulFit', () => {
  it('fits a frigate up to its hold, then an industrial, then an Epithal', () => {
    expect(haulFit(400)!.smallest).toBe('frigate');
    expect(haulFit(400.5)!.smallest).toBe('industrial');
    expect(haulFit(5000)!.smallest).toBe('industrial');
    expect(haulFit(5001)!.smallest).toBe('epithal');
    expect(haulFit(45_000)!.smallest).toBe('epithal');
  });

  it('marks every ship that holds the trip, not only the smallest', () => {
    expect(haulFit(300)!.fits).toEqual({ frigate: true, industrial: true, epithal: true });
    expect(haulFit(4000)!.fits).toEqual({ frigate: false, industrial: true, epithal: true });
    expect(haulFit(20_000)!.fits).toEqual({ frigate: false, industrial: false, epithal: true });
  });

  it('counts industrial trips when nothing holds it in one', () => {
    const fit = haulFit(100_000);
    expect(fit!.smallest).toBeNull();
    expect(fit!.industrialTrips).toBe(20);
  });

  it('keeps the thresholds in one documented table', () => {
    expect(HAUL_SHIPS.map((ship) => ship.id)).toEqual(['frigate', 'industrial', 'epithal']);
  });

  it('refuses an unknown or negative load rather than calling it a frigate haul', () => {
    expect(haulFit(null)).toBeNull();
    expect(haulFit(Number.NaN)).toBeNull();
    expect(haulFit(-1)).toBeNull();
  });

  it('treats a colony that ships nothing as fitting everything', () => {
    expect(haulFit(0)?.smallest).toBe('frigate');
  });
});

describe('routeExposure', () => {
  it('does not count the system the route starts in', () => {
    // Home is lowsec; only the two systems after it are flown into.
    const result = routeExposure([sys(1, 0.3), sys(2, 0.4), sys(3, 0.9), sys(4, 1)]);
    expect(result).toEqual({ jumps: 3, lowsec: 1, nullsec: 0 });
  });

  it('counts lowsec and nullsec apart, on the security as the game shows it', () => {
    // 0.45 shows as 0.5 (highsec); 0.05 shows as 0.1 (lowsec); -0.2 is nullsec.
    const result = routeExposure([sys(1, 0.9), sys(2, 0.45), sys(3, 0.05), sys(4, -0.2)]);
    expect(result).toEqual({ jumps: 3, lowsec: 1, nullsec: 1 });
  });

  it('is zero jumps for a route that never leaves its system', () => {
    expect(routeExposure([sys(1, 0.3)])).toEqual({ jumps: 0, lowsec: 0, nullsec: 0 });
  });

  it('refuses a route it could not resolve, and a security it does not know', () => {
    expect(routeExposure(null)).toBeNull();
    expect(routeExposure([sys(1, 0.9), sys(2, null), sys(3, 0.2)])).toEqual({
      jumps: 2,
      lowsec: null,
      nullsec: null,
    });
  });
});

describe('haulSummary', () => {
  const base = { haulDays: 7, restartDays: 3 };

  it('turns m3 a day into m3 a trip at the pilot cadence', () => {
    const summary = haulSummary({
      ...base,
      colonies: [
        { planetId: 1, m3PerDay: 100, todayM3PerDay: 150, route: [sys(1, 0.9), sys(2, 0.9)] },
        { planetId: 2, m3PerDay: 50, todayM3PerDay: 50, route: [sys(3, 0.9), sys(4, 0.9)] },
      ],
    });
    expect(summary.m3PerTrip).toBe(1050);
    expect(summary.todayM3PerTrip).toBe(1400);
    expect(summary.tripsPerWeek).toBe(1);
    expect(summary.fit?.smallest).toBe('industrial');
    expect(summary.complete).toBe(true);
  });

  it('makes more trips a week for a shorter cadence', () => {
    const summary = haulSummary({ ...base, haulDays: 2, colonies: [] });
    expect(summary.tripsPerWeek).toBe(3.5);
  });

  it('reports the farthest colony route to the sell market', () => {
    const summary = haulSummary({
      ...base,
      colonies: [
        { planetId: 1, m3PerDay: 1, todayM3PerDay: 1, route: [sys(1, 0.9), sys(2, 0.9)] },
        {
          planetId: 2,
          m3PerDay: 1,
          todayM3PerDay: 1,
          route: [sys(5, 0.3), sys(6, 0.3), sys(7, 0.2), sys(8, 1)],
        },
      ],
    });
    expect(summary.route).toEqual({
      kind: 'route',
      farthestPlanetId: 2,
      jumps: 3,
      lowsec: 2,
      nullsec: 0,
    });
  });

  it('is a local pickup when the sell market has no route (corp buyback)', () => {
    const summary = haulSummary({
      ...base,
      colonies: [{ planetId: 1, m3PerDay: 10, todayM3PerDay: 10, route: 'local' }],
    });
    expect(summary.route).toEqual({ kind: 'local' });
  });

  it('says the route is unknown when any colony route did not resolve', () => {
    const summary = haulSummary({
      ...base,
      colonies: [
        { planetId: 1, m3PerDay: 10, todayM3PerDay: 10, route: [sys(1, 0.9), sys(2, 0.9)] },
        { planetId: 2, m3PerDay: 10, todayM3PerDay: 10, route: null },
      ],
    });
    expect(summary.route).toEqual({ kind: 'unknown' });
  });

  it('leaves a colony without a figure out of the sum and says the sum is partial', () => {
    const summary = haulSummary({
      ...base,
      colonies: [
        { planetId: 1, m3PerDay: 10, todayM3PerDay: 10, route: 'local' },
        { planetId: 2, m3PerDay: null, todayM3PerDay: null, route: 'local' },
      ],
    });
    expect(summary.m3PerTrip).toBe(70);
    expect(summary.complete).toBe(false);
  });

  it('has no load at all, not a zero one, when nothing could be measured', () => {
    const summary = haulSummary({
      ...base,
      colonies: [{ planetId: 1, m3PerDay: null, todayM3PerDay: null, route: 'local' }],
    });
    expect(summary.m3PerTrip).toBeNull();
    expect(summary.fit).toBeNull();
  });
});
