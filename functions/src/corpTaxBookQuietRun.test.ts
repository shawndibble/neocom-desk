import { describe, expect, it } from 'vitest';
import {
  QUIET_COLLECTIONS,
  QUIET_EXTRACTION_WINDOW_MS,
  QUIET_MAX_AGE_MS,
  extractionsSinceOf,
  fingerprintOf,
  inExtractionWindow,
  journalThroughOf,
  quietAfterReads,
  quietAtStart,
  quietVersionsOf,
  readQuietMarker,
  type QuietMarker,
} from './corpTaxBookQuietRun.js';

const versions = Object.fromEntries(QUIET_COLLECTIONS.map((name) => [name, `v-${name}`]));
const T = Date.parse('2026-10-24T00:00:00Z');

const marker = (over: Partial<QuietMarker> = {}): QuietMarker => ({
  at: T,
  createdAt: 1,
  versions,
  startDate: '2026-10-01',
  divisions: [1],
  journalThrough: { '1': 100 },
  known: [50, 51],
  extractions: 'x',
  extractionsSince: '2026-08-25T00:00:00.000Z',
  paid: 'p',
  ...over,
});
const book = { createdAt: 1, startDate: '2026-10-01', divisions: [1], versions };

describe('quietVersionsOf', () => {
  it('reads the stamps of the collections a full read would read', () => {
    expect(quietVersionsOf({ collectionVersions: { ...versions, observed: 'o' } })).toEqual(
      versions
    );
  });

  it('is null for a book not versioned yet, or missing any one stamp', () => {
    expect(quietVersionsOf({})).toBeNull();
    const rest: Record<string, string> = { ...versions };
    delete rest.payments;
    expect(quietVersionsOf({ collectionVersions: rest })).toBeNull();
  });
});

describe('readQuietMarker', () => {
  it('reads a well-formed marker and refuses a malformed one', () => {
    expect(readQuietMarker(marker())).toEqual(marker());
    expect(readQuietMarker(undefined)).toBeNull();
    expect(readQuietMarker({ ...marker(), known: ['50'] })).toBeNull();
    expect(readQuietMarker({ ...marker(), extractions: undefined })).toBeNull();
    expect(readQuietMarker({ ...marker(), paid: 1 })).toBeNull();
  });

  it('refuses a marker from before the extraction window, so one full run writes a new one', () => {
    expect(readQuietMarker({ ...marker(), extractionsSince: undefined })).toBeNull();
  });
});

describe('extraction window', () => {
  it('starts 60 days before the run that fixes it', () => {
    expect(extractionsSinceOf(T)).toBe(new Date(T - QUIET_EXTRACTION_WINDOW_MS).toISOString());
    expect(extractionsSinceOf(T)).toBe('2026-08-25T00:00:00.000Z');
  });

  it('keeps a chunk arriving at or after the cut-off and drops an older or undated one', () => {
    const since = extractionsSinceOf(T);
    expect(inExtractionWindow({ chunkArrivalTime: since }, since)).toBe(true);
    expect(inExtractionWindow({ chunkArrivalTime: '2026-10-20T00:00:00.000Z' }, since)).toBe(true);
    expect(inExtractionWindow({ chunkArrivalTime: '2026-08-24T23:59:59.999Z' }, since)).toBe(false);
    expect(inExtractionWindow({}, since)).toBe(false);
  });
});

describe('quietAtStart', () => {
  it('holds while every stamp and book field is as the quiet run read them', () => {
    expect(quietAtStart(marker(), book, T + 6 * 3_600_000)).toBe(true);
  });

  it('fails once any quiet collection was written since', () => {
    for (const name of QUIET_COLLECTIONS) {
      expect(quietAtStart(marker(), { ...book, versions: { ...versions, [name]: 'new' } }, T)).toBe(
        false
      );
    }
  });

  it('fails for a book not versioned, another book, or changed start date or divisions', () => {
    expect(quietAtStart(marker(), { ...book, versions: null }, T)).toBe(false);
    expect(quietAtStart(marker(), { ...book, createdAt: 2 }, T)).toBe(false);
    expect(quietAtStart(marker(), { ...book, startDate: '2026-09-01' }, T)).toBe(false);
    expect(quietAtStart(marker(), { ...book, divisions: [1, 2] }, T)).toBe(false);
    expect(quietAtStart(null, book, T)).toBe(false);
  });

  it('expires: a full run at least once a day, even if a stamp was missed', () => {
    expect(quietAtStart(marker(), book, T + QUIET_MAX_AGE_MS - 1)).toBe(true);
    expect(quietAtStart(marker(), book, T + QUIET_MAX_AGE_MS)).toBe(false);
    expect(quietAtStart(marker(), book, T - 1)).toBe(false);
  });
});

describe('quietAfterReads', () => {
  const run = {
    donationsRead: true,
    donations: [{ division: 1, refId: 100 }],
    characterIds: [50],
    extractions: 'x',
  };

  it('holds when ESI brought nothing the quiet run had not seen', () => {
    expect(quietAfterReads(marker(), run)).toBe(true);
    expect(quietAfterReads(marker(), { ...run, donations: [] })).toBe(true);
  });

  it('fails on a newer donation, or one in a division it saw none in', () => {
    expect(quietAfterReads(marker(), { ...run, donations: [{ division: 1, refId: 101 }] })).toBe(
      false
    );
    expect(quietAfterReads(marker(), { ...run, donations: [{ division: 2, refId: 5 }] })).toBe(
      false
    );
  });

  it('fails when a division could not be read', () => {
    expect(quietAfterReads(marker(), { ...run, donationsRead: false })).toBe(false);
  });

  it('fails on a Character new to it, who could match an Unmatched donation', () => {
    expect(quietAfterReads(marker(), { ...run, characterIds: [50, 99] })).toBe(false);
  });

  it('fails when the extractions changed: dismissal credits rest on them', () => {
    expect(quietAfterReads(marker(), { ...run, extractions: 'y' })).toBe(false);
  });
});

describe('journalThroughOf', () => {
  it('is the newest refId per division', () => {
    expect(
      journalThroughOf([
        { division: 1, refId: 5 },
        { division: 1, refId: 9 },
        { division: 3, refId: 2 },
      ])
    ).toEqual({ '1': 9, '3': 2 });
  });
});

describe('fingerprintOf', () => {
  it('fingerprints a set of ids whatever their order', () => {
    expect(fingerprintOf(new Set(['a', 'b']))).toBe(fingerprintOf(['b', 'a']));
    expect(fingerprintOf(['a'])).not.toBe(fingerprintOf(['a', 'b']));
  });

  it('ignores doc and key order, and changes with any value', () => {
    const a = { id: 'a', moonId: 7, structureId: 1 };
    const b = { id: 'b', moonId: 8, structureId: 2 };
    expect(fingerprintOf([a, b])).toBe(fingerprintOf([{ structureId: 2, moonId: 8, id: 'b' }, a]));
    expect(fingerprintOf([a, b])).not.toBe(fingerprintOf([a, { ...b, moonId: 9 }]));
  });
});
