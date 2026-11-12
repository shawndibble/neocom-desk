import { describe, expect, it } from 'vitest';
import type { SyncExtraction } from './sync';
import { moonOwnerChunksByCorporation } from './moonOwnerChunks';

const OWNER_A = 98000002;
const OWNER_B = 98000003;

const chunk = (over: Partial<SyncExtraction> = {}): SyncExtraction => ({
  structureId: 7001,
  moonId: 40000001,
  extractionStartTime: '2026-11-01T00:00:00.000Z',
  chunkArrivalTime: '2026-11-15T00:00:00.000Z',
  naturalDecayTime: '2026-11-15T03:00:00.000Z',
  sourceCorporationId: OWNER_A,
  ...over,
});

describe('moonOwnerChunksByCorporation', () => {
  it("lists each moon owner's chunks under its corporation, as board sources", () => {
    const out = moonOwnerChunksByCorporation({
      extractions: [chunk(), chunk({ structureId: 7002, sourceCorporationId: OWNER_B })],
      feeders: [],
      skip: new Set(),
    });
    expect([...out.keys()].sort()).toEqual([OWNER_A, OWNER_B]);
    expect(out.get(OWNER_A)).toEqual([
      {
        structureId: 7001,
        subject: 'Moon 40000001',
        chunkArrivalMs: Date.parse('2026-11-15T00:00:00Z'),
        naturalDecayMs: Date.parse('2026-11-15T03:00:00Z'),
      },
    ]);
  });

  it("leaves out the book's own chunks, cancelled ones, and a corporation read straight from ESI", () => {
    const out = moonOwnerChunksByCorporation({
      extractions: [
        chunk({ sourceCorporationId: undefined }),
        chunk({ structureId: 7003, cancelledAt: '2026-11-05T00:00:00.000Z' }),
        chunk({ structureId: 7002, sourceCorporationId: OWNER_B }),
      ],
      feeders: [],
      skip: new Set([OWNER_B]),
    });
    expect(out.size).toBe(0);
  });

  it('names a refinery by its officer label, then the structure name the grant read', () => {
    const out = moonOwnerChunksByCorporation({
      extractions: [chunk(), chunk({ structureId: 7002 })],
      feeders: [
        {
          refineryLabels: { 7001: { label: 'Home rock', setAt: '2026-11-02T00:00:00.000Z' } },
          refineryStructures: {
            7001: { name: 'Efa - Tatara', checkedAt: 1 },
            7002: { name: 'Efa - Athanor', checkedAt: 1 },
          },
        },
      ],
      skip: new Set(),
    });
    expect(out.get(OWNER_A)?.map((x) => x.subject)).toEqual(['Home rock', 'Efa - Athanor']);
  });

  it('lists one Extraction once, however often it is stored', () => {
    const out = moonOwnerChunksByCorporation({
      extractions: [chunk(), chunk()],
      feeders: [],
      skip: new Set(),
    });
    expect(out.get(OWNER_A)).toHaveLength(1);
  });

  it('drops a chunk whose times do not parse rather than placing it at the epoch', () => {
    const out = moonOwnerChunksByCorporation({
      extractions: [chunk({ chunkArrivalTime: 'soon' })],
      feeders: [],
      skip: new Set(),
    });
    expect(out.size).toBe(0);
  });
});
