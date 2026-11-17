import { describe, expect, it } from 'vitest';
import type { MoonDoc } from '../../../functions/src/corpTaxBookMoonDocs';
import { docMining, minedPullCount, oreValue, refineryMiners } from './refineryDocs';

const price = (id: number) => (id === 1 ? 10 : id === 2 ? 100 : 0);
const doc = (id: string, over: Partial<MoonDoc> = {}): MoonDoc => ({
  schema: 1,
  extractionId: id,
  structureId: 5,
  moonId: 50,
  startedAt: '2026-10-01T00:00:00Z',
  chunkArrivalAt: '2026-10-05T00:00:00Z',
  fracturedAt: '2026-10-05T03:00:00Z',
  expiresAt: '2026-10-08T03:00:00Z',
  cancelled: false,
  chunk: { source: 'notification', oreLines: [] },
  surveyId: null,
  mined: [],
  minedPct: null,
  minerCount: 0,
  miners: [],
  frozenTax: 0,
  frozenLines: 0,
  ...over,
});

describe('oreValue', () => {
  it('prices each line, an unpriced ore at 0', () => {
    expect(
      oreValue(
        [
          { typeId: 1, quantity: 3 },
          { typeId: 2, quantity: 2 },
          { typeId: 9, quantity: 50 },
        ],
        price
      )
    ).toBe(230);
  });
});

describe('refineryMiners', () => {
  it('totals each Miner across Extractions, biggest first, counting every one', () => {
    const miners = refineryMiners(
      [
        doc('a', {
          chunkArrivalAt: '2026-09-05T00:00:00Z',
          miners: [
            { minerId: 'm1', oreLines: [{ typeId: 1, quantity: 10 }] },
            { minerId: 'solo:7', oreLines: [{ typeId: 2, quantity: 5 }] },
          ],
        }),
        doc('b', { miners: [{ minerId: 'm1', oreLines: [{ typeId: 1, quantity: 20 }] }] }),
      ],
      price
    );
    expect(miners).toEqual([
      { minerId: 'solo:7', pulls: 1, lastPopAt: '2026-09-05T00:00:00Z', isk: 500 },
      { minerId: 'm1', pulls: 2, lastPopAt: '2026-10-05T00:00:00Z', isk: 300 },
    ]);
  });

  it('puts the larger first and never drops a Miner', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      minerId: `m${i}`,
      oreLines: [{ typeId: 1, quantity: i + 1 }],
    }));
    const out = refineryMiners([doc('a', { miners: many })], price);
    expect(out).toHaveLength(40);
    expect(out[0].minerId).toBe('m39');
  });

  it('is empty with no mining', () => {
    expect(refineryMiners([doc('a')], price)).toEqual([]);
  });
});

describe('minedPullCount', () => {
  it('counts the Extractions someone mined in', () => {
    const mined = doc('a', { miners: [{ minerId: 'm1', oreLines: [] }] });
    expect(minedPullCount([mined, doc('b')])).toBe(1);
  });
});

describe('docMining', () => {
  it('dates a line the day its window ends, never after today', () => {
    const d = doc('a', { miners: [{ minerId: 'm1', oreLines: [{ typeId: 1, quantity: 4 }] }] });
    expect(docMining([d], price, '2026-12-01')).toEqual([
      { structureId: 5, characterId: 0, date: '2026-10-08', quantity: 4, value: 40 },
    ]);
    expect(docMining([d], price, '2026-10-06')[0].date).toBe('2026-10-06');
  });
});
