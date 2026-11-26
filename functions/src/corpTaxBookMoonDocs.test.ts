import { describe, expect, it } from 'vitest';
import {
  MOON_DOC_SCHEMA,
  computeMoonDoc,
  moonDocsToCheck,
  overlappingPulls,
  type StoredExtraction,
} from './corpTaxBookMoonDocs.js';

const pull = (start: string, over: Partial<StoredExtraction> = {}): StoredExtraction => ({
  structureId: 1000,
  moonId: 7,
  extractionStartTime: start,
  chunkArrivalTime: '2026-08-02T00:00:00Z',
  naturalDecayTime: '2026-08-02T03:00:00Z',
  ...over,
});
const rules = { expiryHours: {}, minerOf: (c: number) => `solo:${c}` };

describe('computeMoonDoc on a Running account', () => {
  it('holds no tax: nothing freezes a pull’s tax, and the device prices every day', () => {
    const doc = computeMoonDoc(
      pull('2026-07-26T00:00:00Z'),
      [
        {
          structureId: 1000,
          characterId: 5,
          recordedCorporationId: 1,
          typeId: 1,
          date: '2026-08-03',
          quantity: 10,
          cachedAt: '',
        },
      ],
      rules
    );
    expect(doc).toMatchObject({
      schema: MOON_DOC_SCHEMA,
      frozenTax: 0,
      frozenLines: 0,
      minerCount: 1,
    });
    expect(MOON_DOC_SCHEMA).toBe(2);
  });
});

describe('moonDocsToCheck: the nightly pass rebuilds only what can still change', () => {
  const closed = pull('2026-07-26T00:00:00Z');
  const open = pull('2026-10-01T00:00:00Z', {
    chunkArrivalTime: '2026-10-10T00:00:00Z',
    naturalDecayTime: '2026-10-10T03:00:00Z',
  });
  const closedId = `1000_${Date.parse(closed.extractionStartTime)}`;
  const openId = `1000_${Date.parse(open.extractionStartTime)}`;
  const today = '2026-11-18';

  it('skips a closed pull whose doc is current', () => {
    const held = new Map([
      [closedId, MOON_DOC_SCHEMA],
      [openId, MOON_DOC_SCHEMA],
    ]);
    expect([...moonDocsToCheck([closed, open], held, {}, today)]).toEqual([openId]);
  });

  it('rebuilds a closed pull with no doc or an older schema, and checks a doc whose pull is gone', () => {
    expect([...moonDocsToCheck([closed], new Map(), {}, today)]).toEqual([closedId]);
    expect([...moonDocsToCheck([closed], new Map([[closedId, 1]]), {}, today)]).toEqual([closedId]);
    expect([...moonDocsToCheck([], new Map([['gone', MOON_DOC_SCHEMA]]), {}, today)]).toEqual([
      'gone',
    ]);
  });
});

describe('overlappingPulls', () => {
  it('flags two pulls at one structure covering the same day', () => {
    const a = pull('2026-07-26T00:00:00Z');
    const b = pull('2026-07-27T00:00:00Z', { naturalDecayTime: '2026-08-03T03:00:00Z' });
    const c = pull('2026-07-28T00:00:00Z', { structureId: 2000 });
    expect(overlappingPulls([a, b, c], {})).toEqual([
      {
        structureId: 1000,
        a: `1000_${Date.parse(a.extractionStartTime)}`,
        b: `1000_${Date.parse(b.extractionStartTime)}`,
      },
    ]);
    expect(overlappingPulls([a, { ...b, cancelledAt: '2026-07-30T00:00:00Z' }], {})).toEqual([]);
  });
});
