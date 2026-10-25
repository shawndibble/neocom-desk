// A scheduled run that skips reading the whole book (issue #5048). The first
// thing a scheduled sync did was read every Miner, Statement, payment, dismissal
// and write-off: O(book) reads every 6 hours, also when nothing had changed.
//
// What it reads them for: matching new donations, re-matching Unmatched ones, and
// planning which Statements are settled. A run that found none of that to do
// leaves a **quiet marker** on the book: the version stamps (#5047,
// corpTaxBookVersionTracking.ts) of those collections as that run read them, and
// what else its decisions rested on. A later run whose stamps still match, whose
// ESI reads bring no new donation and no new Character, and whose extractions
// read the same, would decide exactly what the quiet run decided — nothing — so
// it skips those reads and those steps. It still merges the ledger and the
// extractions, and records the sync.
//
// It never settles, assigns or adds a payment on the skipped path, so a stale
// marker can only delay those, never make a wrong settle (D22). A delay is
// bounded: the marker expires after QUIET_MAX_AGE_MS, which forces a full run
// whatever hid a change — a stamp that failed, one that landed before its
// write committed (corpTaxBookVersionTracking.ts records at the call), or a
// multi-page journal read whose pages came from different ESI snapshots, which
// can drop a donation below the refId watermark.

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DISMISSALS, MINERS, PAYMENTS, STATEMENTS, WRITE_OFFS } from './corpTaxBook.js';
import { COLLECTION_VERSIONS_FIELD } from './corpTaxBookVersionKeys.js';

/**
 * Doc under `corps/{id}/meta`: the last quiet run's marker. Written only by the
 * scheduled sync. Not on the book doc: any signed-in Character may read that, and
 * the marker lists the corp's Characters; `meta` is officers-only.
 */
export const QUIET_DOC = 'scheduledQuiet';

/** A marker older than this is ignored: at least one full run a day, whatever the stamps say. */
export const QUIET_MAX_AGE_MS = 24 * 3_600_000;

/**
 * What `readBookStateAdmin` reads that a quiet run does not. Not `meta`: every
 * run writes its status there, so its stamp always moves; a quiet run reads the
 * one meta doc that counts (`paid`) and compares it instead, as it does the
 * extractions.
 */
export const QUIET_COLLECTIONS = [MINERS, STATEMENTS, PAYMENTS, DISMISSALS, WRITE_OFFS] as const;

export interface QuietMarker {
  /** When the quiet run started. */
  at: number;
  /** The book's `createdAt`: a book deleted and turned on again is another book. */
  createdAt: unknown;
  /** `collectionVersions` of `QUIET_COLLECTIONS`, as the quiet run read them. */
  versions: Record<string, string>;
  /** Book doc fields the decisions read. */
  startDate: string;
  divisions: number[];
  /** Per wallet division, the newest donation `refId` the quiet run saw (all of them stored). */
  journalThrough: Record<string, number>;
  /** Every Character the quiet run knew: one new to it could match an Unmatched donation. */
  known: number[];
  /** The extractions it read, which dismissal credits rest on (`fingerprintOf`). */
  extractions: string;
  /** The Statements it held as paid (`fingerprintOf`), which settling rests on. */
  paid: string;
}

/** The quiet collections' stamps on a book doc, or null when any is missing (a book not versioned yet). */
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
    typeof m.paid !== 'string'
  ) {
    return null;
  }
  return m as QuietMarker;
}

/**
 * Whether the book doc alone says the book is as the quiet run read it: the
 * marker is fresh, for this book, and every quiet collection's stamp is the same.
 */
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

/**
 * Whether this run's ESI reads leave the quiet run's decisions standing: every
 * division was read, no donation is newer than what it saw, no Character is new
 * to it, and the extractions read the same.
 */
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

/** The newest donation `refId` per division. */
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

/** Key order and doc order left out: the same extractions always print the same. */
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

/** A fingerprint of a set of stored values (the extractions, the paid ids), whatever order they were read in. */
export function fingerprintOf(values: Iterable<unknown>): string {
  const docs = [...values].map((x) => JSON.stringify(canonical(x))).sort();
  return createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
