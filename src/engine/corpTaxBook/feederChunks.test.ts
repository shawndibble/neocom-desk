import { describe, expect, it } from 'vitest';
import type { SyncExtraction } from './sync';
import { feederChunksByCorporation, type FeederChunkBook } from './feederChunks';

const OWNER_A = 98000002;
const OWNER_B = 98000003;
const NOW = Date.parse('2026-11-12T08:00:00Z');

const chunk = (over: Partial<SyncExtraction> = {}): SyncExtraction => ({
  structureId: 7001,
  moonId: 40000001,
  extractionStartTime: '2026-11-01T00:00:00.000Z',
  chunkArrivalTime: '2026-11-15T00:00:00.000Z',
  naturalDecayTime: '2026-11-15T03:00:00.000Z',
  sourceCorporationId: OWNER_A,
  ...over,
});
const book = (extractions: SyncExtraction[], feeders: FeederChunkBook['feeders'] = []) => ({
  extractions,
  feeders,
});
const run = (books: FeederChunkBook[], skip: number[] = []) =>
  feederChunksByCorporation({ books, skip: new Set(skip), now: NOW });

describe('feederChunksByCorporation', () => {
  it("lists each Feeder's chunks under its corporation, as board sources", () => {
    const out = run([book([chunk(), chunk({ structureId: 7002, sourceCorporationId: OWNER_B })])]);
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
    const out = run(
      [
        book([
          chunk({ sourceCorporationId: undefined }),
          chunk({ structureId: 7003, cancelledAt: '2026-11-05T00:00:00.000Z' }),
          chunk({ structureId: 7002, sourceCorporationId: OWNER_B }),
        ]),
      ],
      [OWNER_B]
    );
    expect(out.size).toBe(0);
  });

  it('leaves out a chunk that has already decayed, so a Feeder with only past pops adds nothing', () => {
    const out = run([
      book([
        chunk({
          extractionStartTime: '2026-10-01T00:00:00.000Z',
          chunkArrivalTime: '2026-10-15T00:00:00.000Z',
          naturalDecayTime: '2026-10-15T03:00:00.000Z',
        }),
      ]),
    ]);
    expect(out.size).toBe(0);
  });

  it('names a refinery by its own book’s officer label, then the structure name the grant read', () => {
    const out = run([
      book(
        [chunk(), chunk({ structureId: 7002 })],
        [
          {
            refineryLabels: { 7001: { label: 'Home rock', setAt: '2026-11-02T00:00:00.000Z' } },
            refineryStructures: {
              7001: { name: 'Efa - Tatara', checkedAt: 1 },
              7002: { name: 'Efa - Athanor', checkedAt: 1 },
            },
          },
        ]
      ),
    ]);
    expect(out.get(OWNER_A)?.map((x) => x.subject)).toEqual(['Home rock', 'Efa - Athanor']);
  });

  it("never names one book's refinery with another book's label", () => {
    const out = run([
      book([chunk()]),
      book(
        [chunk({ structureId: 9001, sourceCorporationId: OWNER_B })],
        [{ refineryLabels: { 7001: { label: 'Not yours', setAt: '2026-11-02T00:00:00.000Z' } } }]
      ),
    ]);
    expect(out.get(OWNER_A)?.[0]?.subject).toBe('Moon 40000001');
  });

  it('lists one Extraction once, however many books hold it', () => {
    expect(run([book([chunk()]), book([chunk()])]).get(OWNER_A)).toHaveLength(1);
  });

  it('drops a chunk whose times do not parse rather than placing it at the epoch', () => {
    expect(run([book([chunk({ chunkArrivalTime: 'soon' })])]).size).toBe(0);
  });
});
