import { HOUR_MS } from '@/lib/age';
import { describe, it, expect } from 'vitest';
import {
  diffPlanetaryExtractionDone,
  diffPlanetaryExtractorExpiring,
  disprovenExtractorOccurrences,
  type ColonyExtractorSnapshot,
  type ColonySnapshotEntry,
  type ExtractorExpiringFire,
  type PlanetarySnapshot,
} from './index';
import { occurrenceKey } from '../occurrenceKey';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

function colonyEntry(
  planetId: number,
  expiries: readonly number[],
  thresholdMs: number = 24 * HOUR_MS
): ColonySnapshotEntry {
  return {
    planetId,
    extractors: expiries.map((expiryTimeMs, i) => ({ pinId: i + 1, expiryTimeMs, thresholdMs })),
  };
}

function planetarySnapshot(
  colonies: readonly ColonySnapshotEntry[],
  nowMs: number
): PlanetarySnapshot {
  return { colonies, nowMs };
}

describe('diffPlanetaryExtractionDone', () => {
  it('fires once for a colony already idle on the first-ever poll', () => {
    const next = planetarySnapshot([colonyEntry(1, [T0 - 1000]), colonyEntry(2, [T0 + 1000])], T0);
    expect(diffPlanetaryExtractionDone(1, undefined, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 1, planetId: 1, expiryTimeMs: T0 - 1000 },
    ]);
  });

  it('fires when a colony newly goes idle', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 1000])], T0);
    const next = planetarySnapshot([colonyEntry(1, [T0 + 1000])], T0 + 2000);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: T0 + 1000 },
    ]);
  });

  it('does not fire while every extractor is still active', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 5000])], T0);
    const next = planetarySnapshot([colonyEntry(1, [T0 + 5000])], T0 + 1000);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a colony already idle as of the previous poll', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 - 5000])], T0);
    const next = planetarySnapshot([colonyEntry(1, [T0 - 5000])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([]);
  });

  it('does not fire for a colony with no extractors', () => {
    const prev = planetarySnapshot([colonyEntry(1, [])], T0);
    const next = planetarySnapshot([colonyEntry(1, [])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([]);
  });

  it('fires for a colony discovered already idle (absent from a defined prev with other colonies)', () => {
    const prev = planetarySnapshot([colonyEntry(2, [T0 + 5000])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [T0 - 1000]), colonyEntry(2, [T0 + 5000])],
      T0 + 2000
    );
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: T0 - 1000 },
    ]);
  });

  it('fires once per colony when multiple colonies go idle in the same poll', () => {
    const prev = planetarySnapshot([colonyEntry(1, [T0 + 100]), colonyEntry(2, [T0 + 200])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [T0 + 100]), colonyEntry(2, [T0 + 200])],
      T0 + 300
    );
    expect(diffPlanetaryExtractionDone(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: T0 + 100 },
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 2, expiryTimeMs: T0 + 200 },
    ]);
  });
});

function colonyWithPins(
  planetId: number,
  extractors: readonly ColonyExtractorSnapshot[]
): ColonySnapshotEntry {
  return { planetId, extractors };
}

function expiringFire(
  characterId: number,
  planetId: number,
  pinId: number,
  thresholdMs: number,
  expiryTimeMs: number
): ExtractorExpiringFire {
  return {
    eventId: 'planetaryExtractorExpiring',
    characterId,
    planetId,
    pinId,
    thresholdMs,
    expiryTimeMs,
  };
}

describe('diffPlanetaryExtractorExpiring', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = planetarySnapshot([colonyEntry(1, [T0 + 10 * HOUR_MS])], T0);
    expect(diffPlanetaryExtractorExpiring(7, undefined, next)).toEqual([]);
  });

  it('never fires for a program that has already expired, even across a closed-app gap', () => {
    const expiryMs = T0 + 30 * HOUR_MS;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs + 5 * HOUR_MS);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('fires nothing at the instant of expiry, handing the colony to planetaryExtractionDone', () => {
    const expiryMs = T0 + 30 * HOUR_MS;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], expiryMs);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('does not fire while the program is outside the configured lead time', () => {
    const expiryMs = T0 + 40 * HOUR_MS;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('fires once as the program crosses into its configured lead time', () => {
    const expiryMs = T0 + 24 * HOUR_MS + FIVE_MIN;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, expiryMs),
    ]);
  });

  it('fires when the remaining time lands exactly on the threshold', () => {
    const expiryMs = T0 + 24 * HOUR_MS + 1;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + 1);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, expiryMs),
    ]);
  });

  it('does not re-fire on later polls still inside the lead time', () => {
    const expiryMs = T0 + 24 * HOUR_MS;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + FIVE_MIN);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs])], T0 + 2 * FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([]);
  });

  it('fires once at whatever lead time the Character has configured, not a fixed window', () => {
    const expiryMs = T0 + 24 * HOUR_MS;
    const crossing = planetarySnapshot(
      [colonyEntry(1, [expiryMs], 6 * HOUR_MS)],
      expiryMs - 6 * HOUR_MS
    );
    const beforeCrossing = planetarySnapshot(
      [colonyEntry(1, [expiryMs], 6 * HOUR_MS)],
      expiryMs - 6 * HOUR_MS - FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, beforeCrossing, crossing)).toEqual([
      expiringFire(7, 1, 1, 6 * HOUR_MS, expiryMs),
    ]);

    const after = planetarySnapshot(
      [colonyEntry(1, [expiryMs], 6 * HOUR_MS)],
      expiryMs - 6 * HOUR_MS + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, crossing, after)).toEqual([]);
  });

  it('takes effect on the very next poll when the Character raises their configured lead time', () => {
    const expiryMs = T0 + 20 * HOUR_MS;
    const prev = planetarySnapshot([colonyEntry(1, [expiryMs], 6 * HOUR_MS)], T0);
    const next = planetarySnapshot([colonyEntry(1, [expiryMs], 24 * HOUR_MS)], T0 + FIVE_MIN);
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, expiryMs),
    ]);
  });

  it('fires once for a program first observed already inside the lead time', () => {
    const expiryMs = T0 + 20 * HOUR_MS;
    const prev = planetarySnapshot([colonyWithPins(1, [])], T0);
    const next = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 42, expiryTimeMs: expiryMs, thresholdMs: 24 * HOUR_MS }])],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 42, 24 * HOUR_MS, expiryMs),
    ]);
  });

  it('fires for a colony absent from a defined prev', () => {
    const expiryMs = T0 + 20 * HOUR_MS;
    const prev = planetarySnapshot([colonyEntry(2, [T0 + 40 * HOUR_MS])], T0);
    const next = planetarySnapshot(
      [colonyEntry(1, [expiryMs]), colonyEntry(2, [T0 + 40 * HOUR_MS])],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, expiryMs),
    ]);
  });

  it('fires for a program restarted on a pin whose previous program was already inside the lead time', () => {
    const prev = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 5, expiryTimeMs: T0 - 2 * HOUR_MS, thresholdMs: 24 * HOUR_MS },
        ]),
      ],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 5, expiryTimeMs: T0 + 20 * HOUR_MS, thresholdMs: 24 * HOUR_MS },
        ]),
      ],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 5, 24 * HOUR_MS, T0 + 20 * HOUR_MS),
    ]);
  });

  it('fires per extractor program across colonies', () => {
    const prev = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 1, expiryTimeMs: T0 + 24 * HOUR_MS + FIVE_MIN, thresholdMs: 24 * HOUR_MS },
          { pinId: 2, expiryTimeMs: T0 + 24 * HOUR_MS + FIVE_MIN, thresholdMs: 24 * HOUR_MS },
        ]),
        colonyWithPins(2, [
          { pinId: 3, expiryTimeMs: T0 + 40 * HOUR_MS, thresholdMs: 24 * HOUR_MS },
        ]),
      ],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 1, expiryTimeMs: T0 + 24 * HOUR_MS + FIVE_MIN, thresholdMs: 24 * HOUR_MS },
          { pinId: 2, expiryTimeMs: T0 + 24 * HOUR_MS + FIVE_MIN, thresholdMs: 24 * HOUR_MS },
        ]),
        colonyWithPins(2, [
          { pinId: 3, expiryTimeMs: T0 + 40 * HOUR_MS, thresholdMs: 24 * HOUR_MS },
        ]),
      ],
      T0 + FIVE_MIN
    );
    expect(diffPlanetaryExtractorExpiring(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, T0 + 24 * HOUR_MS + FIVE_MIN),
      expiringFire(7, 1, 2, 24 * HOUR_MS, T0 + 24 * HOUR_MS + FIVE_MIN),
    ]);
  });
});

describe('disprovenExtractorOccurrences', () => {
  const OLD_EXPIRY = T0 + 10 * HOUR_MS;
  const NEW_EXPIRY = T0 + 58 * HOUR_MS;

  function restartedEarly(planetId = 1, pinId = 1) {
    return {
      prev: planetarySnapshot(
        [
          colonyWithPins(planetId, [
            { pinId, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS },
          ]),
        ],
        T0
      ),
      next: planetarySnapshot(
        [
          colonyWithPins(planetId, [
            {
              pinId,
              expiryTimeMs: NEW_EXPIRY,
              thresholdMs: 24 * HOUR_MS,
              installTimeMs: OLD_EXPIRY - 10 * 60_000,
            },
          ]),
        ],
        OLD_EXPIRY + HOUR_MS
      ),
    };
  }

  it('finds nothing without a baseline to compare against', () => {
    const { next } = restartedEarly();
    expect(disprovenExtractorOccurrences(7, undefined, next)).toEqual([]);
  });

  it('finds every occurrence that was already false when it fired', () => {
    const { prev, next } = restartedEarly();
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: OLD_EXPIRY },
    ]);
  });

  it('retracts a lead-time warning only when the replacement predates the warning itself', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      OLD_EXPIRY - 40 * HOUR_MS
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY - 30 * HOUR_MS,
          },
        ]),
      ],
      OLD_EXPIRY + HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, OLD_EXPIRY),
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: OLD_EXPIRY },
    ]);
  });

  it('keeps a lead-time warning that was true when it fired, retracting only the stop', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      OLD_EXPIRY - 40 * HOUR_MS
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY - 18 * HOUR_MS,
          },
        ]),
      ],
      OLD_EXPIRY + HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: OLD_EXPIRY },
    ]);
  });

  it('retracts nothing on the boundary, where the replacement lands exactly when the alert fired', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      OLD_EXPIRY - 40 * HOUR_MS
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY - 24 * HOUR_MS,
          },
        ]),
      ],
      OLD_EXPIRY + HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).not.toContainEqual(
      expiringFire(7, 1, 1, 24 * HOUR_MS, OLD_EXPIRY)
    );
  });

  it('finds nothing when the program was left to expire and only then restarted', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY + 1,
          },
        ]),
      ],
      OLD_EXPIRY + 2 * HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([]);
  });

  it('finds nothing for a program still running under its original expiry', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: OLD_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: T0 - HOUR_MS,
          },
        ]),
      ],
      T0 + FIVE_MIN
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([]);
  });

  it('claims nothing when ESI omitted the replacement program install time', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      T0
    );
    const next = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: NEW_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      OLD_EXPIRY + HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([]);
  });

  it('claims nothing about a colony or pin that has since disappeared', () => {
    const prev = planetarySnapshot(
      [
        colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }]),
        colonyWithPins(2, [{ pinId: 9, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }]),
      ],
      T0
    );
    const next = planetarySnapshot([colonyWithPins(2, [])], OLD_EXPIRY + HOUR_MS);
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([]);
  });

  it('retracts the colony-level stop only when every pin that set the soonest expiry was cut short', () => {
    const prev = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS },
          { pinId: 2, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS },
        ]),
      ],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY - 30 * HOUR_MS,
          },
          {
            pinId: 2,
            expiryTimeMs: OLD_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: T0 - HOUR_MS,
          },
        ]),
      ],
      OLD_EXPIRY + HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, OLD_EXPIRY),
    ]);
  });

  it('leaves a later pin alone when only the soonest-expiring one was restarted', () => {
    const laterExpiry = OLD_EXPIRY + 20 * HOUR_MS;
    const prev = planetarySnapshot(
      [
        colonyWithPins(1, [
          { pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS },
          { pinId: 2, expiryTimeMs: laterExpiry, thresholdMs: 24 * HOUR_MS },
        ]),
      ],
      T0
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY - 30 * HOUR_MS,
          },
          {
            pinId: 2,
            expiryTimeMs: laterExpiry,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: T0 - HOUR_MS,
          },
        ]),
      ],
      OLD_EXPIRY + HOUR_MS
    );
    expect(disprovenExtractorOccurrences(7, prev, next)).toEqual([
      expiringFire(7, 1, 1, 24 * HOUR_MS, OLD_EXPIRY),
      { eventId: 'planetaryExtractionDone', characterId: 7, planetId: 1, expiryTimeMs: OLD_EXPIRY },
    ]);
  });

  it('produces occurrence keys the poller and the push backend already agree on', () => {
    const prev = planetarySnapshot(
      [colonyWithPins(1, [{ pinId: 1, expiryTimeMs: OLD_EXPIRY, thresholdMs: 24 * HOUR_MS }])],
      OLD_EXPIRY - 40 * HOUR_MS
    );
    const next = planetarySnapshot(
      [
        colonyWithPins(1, [
          {
            pinId: 1,
            expiryTimeMs: NEW_EXPIRY,
            thresholdMs: 24 * HOUR_MS,
            installTimeMs: OLD_EXPIRY - 30 * HOUR_MS,
          },
        ]),
      ],
      OLD_EXPIRY + HOUR_MS
    );
    const keys = disprovenExtractorOccurrences(7, prev, next).map((fire) =>
      occurrenceKey(fire, next.nowMs)
    );
    expect(keys).toContain(`7:planetaryExtractionDone:1:${OLD_EXPIRY}`);
    expect(keys).toContain(`7:planetaryExtractorExpiring:1:${OLD_EXPIRY}:${24 * HOUR_MS}`);
  });
});
