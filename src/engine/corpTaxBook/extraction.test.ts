import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHUNK_M3_PER_HOUR,
  DEFAULT_EXPIRY_HOURS,
  MAX_EXPIRY_HOURS,
  estimateChunk,
  extractionStatus,
  minedVsLeft,
  minedDuringExtraction,
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
    });
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
