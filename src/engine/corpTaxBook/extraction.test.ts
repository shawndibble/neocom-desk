import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHUNK_M3_PER_HOUR,
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  MEASURED_RATE_WINDOW,
  chunkRateFor,
  estimateChunk,
  extractionStatus,
  learnChunkRates,
  measureChunkRate,
  minedVsLeft,
  minedDuringExtraction,
  surveyFractions,
  type Extraction,
} from './extraction';
import type { ObservedMiningEntry } from './types';

const ORE_A = 45490;
const ORE_B = 45491;

const ex: Extraction = {
  id: 'x1',
  structureId: 1001,
  moonId: 40000001,
  startedAt: '2026-07-01T00:00:00Z',
  chunkArrivalAt: '2026-07-07T00:00:00Z',
  naturalDecayAt: '2026-07-07T03:00:00Z',
};

describe('extractionStatus', () => {
  it('is Extracting until the chunk arrives', () => {
    expect(extractionStatus(ex, '2026-07-06T23:59:00Z').state).toBe('extracting');
  });

  it('is Ready from arrival until it fractures', () => {
    expect(extractionStatus(ex, '2026-07-07T00:00:00Z').state).toBe('ready');
  });

  it('fractures on its own at natural_decay_time, and expires 48h later by default', () => {
    expect(DEFAULT_EXPIRY_HOURS).toBe(48);
    expect(extractionStatus(ex, '2026-07-07T03:00:00Z')).toEqual({
      state: 'fractured',
      fracturedAt: '2026-07-07T03:00:00.000Z',
      fracturedBy: 'auto',
      expiresAt: '2026-07-09T03:00:00.000Z',
    });
    expect(extractionStatus(ex, '2026-07-09T03:00:00Z').state).toBe('expired');
  });

  it('fractures when the laser is fired', () => {
    const fired = { ...ex, laserFiredAt: '2026-07-07T01:00:00Z' };
    expect(extractionStatus(fired, '2026-07-07T01:30:00Z')).toMatchObject({
      state: 'fractured',
      fracturedBy: 'laser',
      expiresAt: '2026-07-09T01:00:00.000Z',
    });
  });

  it('takes a per-structure expiry override, capped at 4 days', () => {
    expect(MAX_EXPIRY_HOURS).toBe(96);
    expect(extractionStatus(ex, '2026-07-08T00:00:00Z', { expiryHours: 72 }).expiresAt).toBe(
      '2026-07-10T03:00:00.000Z'
    );
    expect(extractionStatus(ex, '2026-07-08T00:00:00Z', { expiryHours: 200 }).expiresAt).toBe(
      '2026-07-11T03:00:00.000Z'
    );
  });

  it('a cancelled extraction is cancelled', () => {
    expect(
      extractionStatus({ ...ex, cancelledAt: '2026-07-03T00:00:00Z' }, '2026-07-08T00:00:00Z').state
    ).toBe('cancelled');
  });
});

describe('estimateChunk', () => {
  it('takes the ore from the ExtractionStarted notification first (10 m³ per unit)', () => {
    expect(
      estimateChunk(ex, {
        notified: [
          { typeId: ORE_A, volumeM3: 1_000_000 },
          { typeId: ORE_B, volumeM3: 500_000 },
        ],
        survey: [{ typeId: ORE_A, fraction: 1 }],
      })
    ).toEqual({
      source: 'notification',
      oreLines: [
        { typeId: ORE_A, quantity: 100_000 },
        { typeId: ORE_B, quantity: 50_000 },
      ],
    });
  });

  it('else splits the chunk volume by a linked Moon Ore Survey, at a configurable m³/h', () => {
    // 6 days = 144h.
    expect(DEFAULT_CHUNK_M3_PER_HOUR).toBe(30_000);
    expect(
      estimateChunk(ex, {
        survey: [
          { typeId: ORE_A, fraction: 0.75 },
          { typeId: ORE_B, fraction: 0.25 },
        ],
        chunkM3PerHour: 20_000,
      })
    ).toEqual({
      source: 'survey',
      oreLines: [
        { typeId: ORE_A, quantity: 216_000 },
        { typeId: ORE_B, quantity: 72_000 },
      ],
      rate: { m3PerHour: 20_000, basis: 'manual' },
    });
  });

  it('prefers the refinery measured rate, then the manual one, then the default', () => {
    const survey = [{ typeId: ORE_A, fraction: 1 }];
    const total = (sources: Parameters<typeof estimateChunk>[1]) =>
      estimateChunk(ex, { survey, ...sources });
    expect(total({ measured: { m3PerHour: 40_000, cycles: 3 }, chunkM3PerHour: 20_000 })).toEqual({
      source: 'survey',
      oreLines: [{ typeId: ORE_A, quantity: 576_000 }],
      rate: { m3PerHour: 40_000, basis: 'measured', cycles: 3 },
    });
    expect(total({ chunkM3PerHour: 20_000 }).oreLines[0].quantity).toBe(288_000);
    const dflt = total({});
    expect(dflt.oreLines[0].quantity).toBe(432_000);
    expect(dflt.rate).toEqual({ m3PerHour: DEFAULT_CHUNK_M3_PER_HOUR, basis: 'default' });
  });

  it('else says the ore is unknown', () => {
    expect(estimateChunk(ex, {})).toEqual({ source: 'unknown', oreLines: [] });
  });
});

describe('minedDuringExtraction', () => {
  it('sums the ore mined at the refinery from the fracture day through the expiry day', () => {
    function entry(date: string, quantity: number, structureId = 1001): ObservedMiningEntry {
      return {
        characterId: 1,
        recordedCorporationId: 2,
        structureId,
        date,
        oreLines: [{ typeId: ORE_A, quantity }],
      };
    }
    expect(
      minedDuringExtraction(ex, [
        entry('2026-07-06', 1),
        entry('2026-07-07', 10),
        entry('2026-07-09', 20),
        entry('2026-07-08', 5, 2002),
        entry('2026-07-10', 1),
      ])
    ).toEqual([{ typeId: ORE_A, quantity: 30 }]);
  });
});

describe('minedVsLeft', () => {
  it('shows mined vs left per ore, never below zero left', () => {
    expect(
      minedVsLeft(
        [
          { typeId: ORE_A, quantity: 100 },
          { typeId: ORE_B, quantity: 50 },
        ],
        [
          { typeId: ORE_A, quantity: 40 },
          { typeId: ORE_B, quantity: 60 },
        ]
      )
    ).toEqual([
      { typeId: ORE_A, estimated: 100, mined: 40, left: 60 },
      { typeId: ORE_B, estimated: 50, mined: 60, left: 0 },
    ]);
  });
});

describe('surveyFractions (D13)', () => {
  const typeIdOf = (name: string) => ({ Zeolites: ORE_A, Sylvite: ORE_B })[name];

  it('reads the chunk’s composition off a Survey’s first scan, as shares of its volume', () => {
    expect(
      surveyFractions(
        [
          { ore: 'Zeolites', volume: 300 },
          { ore: 'Sylvite', volume: 100 },
          { ore: 'Zeolites', volume: 100 },
        ],
        typeIdOf
      )
    ).toEqual([
      { typeId: ORE_A, fraction: 0.8 },
      { typeId: ORE_B, fraction: 0.2 },
    ]);
  });

  it('leaves out ores it cannot name and renormalises the rest', () => {
    expect(
      surveyFractions(
        [
          { ore: 'Zeolites', volume: 100 },
          { ore: 'Mystery', volume: 100 },
        ],
        typeIdOf
      )
    ).toEqual([{ typeId: ORE_A, fraction: 1 }]);
  });

  it('is empty for an empty scan', () => {
    expect(surveyFractions([], typeIdOf)).toEqual([]);
  });
});

describe('measured chunk rate', () => {
  // 6 days = 144h; 4_320_000 m³ is exactly 30,000 m³/h.
  const cycle = (startedAt: string, hours: number, m3: number, structureId = 1001) => ({
    structureId,
    startedAt,
    chunkArrivalAt: new Date(Date.parse(startedAt) + hours * 3_600_000).toISOString(),
    oreLines: [
      { typeId: ORE_A, quantity: (m3 * 0.75) / 10 },
      { typeId: ORE_B, quantity: (m3 * 0.25) / 10 },
    ],
  });

  it('is the notified ore volume over the extraction hours', () => {
    expect(measureChunkRate(cycle('2026-07-01T00:00:00Z', 144, 4_320_000))).toBe(30_000);
  });

  it('is unknown without a notification, or with no extraction time', () => {
    expect(
      measureChunkRate({ ...cycle('2026-07-01T00:00:00Z', 144, 1), oreLines: [] })
    ).toBeUndefined();
    const bare = {
      structureId: 1001,
      startedAt: '2026-07-01T00:00:00Z',
      chunkArrivalAt: '2026-07-07T00:00:00Z',
    };
    expect(measureChunkRate(bare)).toBeUndefined();
    expect(measureChunkRate(cycle('2026-07-01T00:00:00Z', 0, 1_000))).toBeUndefined();
  });

  it('learns the median of a refinery recent cycles, so an outlier does not swing it', () => {
    const rates = learnChunkRates([
      cycle('2026-07-01T00:00:00Z', 100, 3_400_000), // 34,000
      cycle('2026-07-10T00:00:00Z', 100, 3_500_000), // 35,000
      cycle('2026-07-20T00:00:00Z', 100, 900_000), // 9,000 outlier
      cycle('2026-07-01T00:00:00Z', 100, 2_000_000, 2002), // another refinery, 20,000
    ]);
    expect(rates.get(1001)).toEqual({ m3PerHour: 34_000, cycles: 3 });
    expect(rates.get(2002)).toEqual({ m3PerHour: 20_000, cycles: 1 });
  });

  it('averages the two middle cycles of an even count', () => {
    const rates = learnChunkRates([
      cycle('2026-07-01T00:00:00Z', 100, 3_000_000),
      cycle('2026-07-10T00:00:00Z', 100, 4_000_000),
    ]);
    expect(rates.get(1001)).toEqual({ m3PerHour: 35_000, cycles: 2 });
  });

  it('looks only at the most recent cycles', () => {
    const old = Array.from({ length: 4 }, (_, i) =>
      cycle(`2026-01-0${i + 1}T00:00:00Z`, 100, 1_000_000)
    );
    const recent = Array.from({ length: MEASURED_RATE_WINDOW }, (_, i) =>
      cycle(`2026-07-0${i + 1}T00:00:00Z`, 100, 4_000_000)
    );
    expect(learnChunkRates([...old, ...recent]).get(1001)).toEqual({
      m3PerHour: 40_000,
      cycles: MEASURED_RATE_WINDOW,
    });
  });

  it('resolves measured, then manual, then default', () => {
    expect(chunkRateFor({ m3PerHour: 34_200, cycles: 3 }, 20_000)).toEqual({
      m3PerHour: 34_200,
      basis: 'measured',
      cycles: 3,
    });
    expect(chunkRateFor(undefined, 20_000)).toEqual({ m3PerHour: 20_000, basis: 'manual' });
    expect(chunkRateFor(undefined, undefined)).toEqual({
      m3PerHour: DEFAULT_CHUNK_M3_PER_HOUR,
      basis: 'default',
    });
  });
});
