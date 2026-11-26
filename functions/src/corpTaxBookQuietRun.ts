import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { MINERS, PAYMENTS } from './corpTaxBook.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';
import { COLLECTION_VERSIONS_FIELD } from './corpTaxBookVersionKeys.js';

export const QUIET_DOC = 'scheduledQuiet';

export const QUIET_EXTRACTION_WINDOW_MS = 60 * DAY_MS;

export const extractionsSinceOf = (at: number): string =>
  new Date(at - QUIET_EXTRACTION_WINDOW_MS).toISOString();

export const inExtractionWindow = (x: { chunkArrivalTime?: unknown }, since: string): boolean =>
  typeof x.chunkArrivalTime === 'string' && x.chunkArrivalTime >= since;

export const QUIET_MAX_AGE_MS = 24 * HOUR_MS;

export const QUIET_COLLECTIONS = [MINERS, PAYMENTS] as const;

export interface QuietMarker {
  at: number;
  createdAt: unknown;
  versions: Record<string, string>;
  startDate: string;
  divisions: number[];
  journalThrough: Record<string, number>;
  known: number[];
  extractions: string;
  extractionsSince: string;
}

export function quietVersionsOf(bookData: Record<string, unknown>): Record<string, string> | null {
  const all = bookData[COLLECTION_VERSIONS_FIELD];
  if (typeof all !== 'object' || all === null) return null;
  const versions: Record<string, string> = {};
  for (const name of QUIET_COLLECTIONS) {
    const stamp = (all as Record<string, unknown>)[name];
    if (typeof stamp !== 'string' || stamp === '') return null;
    versions[name] = stamp;
  }
  return versions;
}

export function readQuietMarker(raw: unknown): QuietMarker | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Partial<QuietMarker>;
  const numbers = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((n) => typeof n === 'number');
  if (
    typeof m.at !== 'number' ||
    typeof m.versions !== 'object' ||
    m.versions === null ||
    typeof m.startDate !== 'string' ||
    !numbers(m.divisions) ||
    typeof m.journalThrough !== 'object' ||
    m.journalThrough === null ||
    !numbers(m.known) ||
    typeof m.extractions !== 'string' ||
    typeof m.extractionsSince !== 'string'
  ) {
    return null;
  }
  return m as QuietMarker;
}

export function quietAtStart(
  marker: QuietMarker | null,
  book: {
    createdAt: unknown;
    startDate: string;
    divisions: readonly number[];
    versions: Record<string, string> | null;
  },
  now: number
): marker is QuietMarker {
  return (
    marker !== null &&
    book.versions !== null &&
    now - marker.at >= 0 &&
    now - marker.at < QUIET_MAX_AGE_MS &&
    isDeepStrictEqual(marker.createdAt, book.createdAt) &&
    marker.startDate === book.startDate &&
    isDeepStrictEqual(marker.divisions, [...book.divisions]) &&
    isDeepStrictEqual(marker.versions, book.versions)
  );
}

export function quietAfterReads(
  marker: QuietMarker,
  run: {
    donationsRead: boolean;
    donations: readonly { division: number; refId: number }[];
    characterIds: Iterable<number>;
    extractions: string;
  }
): boolean {
  if (!run.donationsRead || run.extractions !== marker.extractions) return false;
  for (const d of run.donations) {
    const through = marker.journalThrough[String(d.division)];
    if (through === undefined || d.refId > through) return false;
  }
  const known = new Set(marker.known);
  for (const id of run.characterIds) if (!known.has(id)) return false;
  return true;
}

export function journalThroughOf(
  donations: readonly { division: number; refId: number }[]
): Record<string, number> {
  const through: Record<string, number> = {};
  for (const d of donations) {
    const key = String(d.division);
    if (through[key] === undefined || d.refId > through[key]) through[key] = d.refId;
  }
  return through;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function fingerprintOf(values: Iterable<unknown>): string {
  const docs = [...values].map((x) => JSON.stringify(canonical(x))).sort();
  return createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
