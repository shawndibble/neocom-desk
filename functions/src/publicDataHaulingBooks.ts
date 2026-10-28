/**
 * The hauling order books job for the GitHub Actions runner
 * (`scripts/public-data/hauling-books.mjs`, `.github/workflows/public-data-hauling-books.yml`).
 * Streams EVE Ref's latest market-order snapshot and writes each Trade Hub station's best
 * price levels per type to R2 (`hauling-books/<stationId>.json`), where the hauling scan builds
 * its order-book pass from them with no ESI request. Its last-run record (the snapshot it
 * published, so an unchanged one is skipped) is the R2 object `hauling-books-state/last-run.json`.
 * Touches no Firestore.
 */
import { gzipSync } from 'node:zlib';
import { ESI_USER_AGENT } from './esiNotifications.js';
import { HaulingBookFold } from './haulingBooks.js';
import { SNAPSHOT_HUBS } from './marketOpenPrices.js';
import { foldOrderBooksUrl } from './marketOrdersArchive.js';
import { createR2Get, createR2Put, r2ConfigFromEnv, type R2Get, type R2Put } from './r2Client.js';

export const HAULING_BOOKS_R2_PREFIX = 'hauling-books/';
export const HAULING_BOOKS_STATE_R2_KEY = 'hauling-books-state/last-run.json';
export const MARKET_ORDERS_LATEST_URL =
  'https://data.everef.net/market-orders/market-orders-latest.v3.csv.bz2';
/** A hub with fewer types than this means a broken snapshot: publish nothing and let the objects age. */
export const MIN_TYPES_PER_HUB = 1000;

const BOOK_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=300',
};
const STATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function haulingBooksR2Key(stationId: number): string {
  return `${HAULING_BOOKS_R2_PREFIX}${stationId}.json`;
}

export interface PublicHaulingBooksDeps {
  get: R2Get;
  put: R2Put;
  now?: () => number;
  /** Test seams: the snapshot's publish time (a HEAD request) and the download-and-fold. */
  publishedAtImpl?: (url: string) => Promise<number | null>;
  foldUrlImpl?: typeof foldOrderBooksUrl;
}

async function fetchPublishedAt(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': ESI_USER_AGENT },
    });
    const modified = Date.parse(response.headers.get('last-modified') ?? '');
    return response.ok && Number.isFinite(modified) ? modified : null;
  } catch {
    return null;
  }
}

/** Publishes the hub books; false when the snapshot is the one already published. Throws when nothing was published. */
export async function publishHaulingBooks(deps: PublicHaulingBooksDeps): Promise<boolean> {
  const now = deps.now ?? Date.now;
  let state: { asOf?: unknown } | null = null;
  try {
    state = (await deps.get(HAULING_BOOKS_STATE_R2_KEY)) as { asOf?: unknown } | null;
  } catch (error) {
    console.warn('Hauling books state read failed', { error: String(error) });
  }
  // Checked before the 20 MB download: most runs find the snapshot they already published.
  const headPublishedAt = await (deps.publishedAtImpl ?? fetchPublishedAt)(
    MARKET_ORDERS_LATEST_URL
  );
  if (headPublishedAt !== null && state?.asOf === headPublishedAt) {
    console.info('Hauling books skipped: snapshot unchanged', { asOf: headPublishedAt });
    return false;
  }
  const books = new HaulingBookFold(SNAPSHOT_HUBS.map((hub) => hub.stationId));
  const { rows, publishedAt } = await (deps.foldUrlImpl ?? foldOrderBooksUrl)(
    MARKET_ORDERS_LATEST_URL,
    books,
    ESI_USER_AGENT
  );
  const asOf = publishedAt ?? now();
  const counts = Object.fromEntries(
    SNAPSHOT_HUBS.map((hub) => [hub.id, books.typeCount(hub.stationId)])
  );
  console.info('Hauling books fold', { rows, asOf, types: counts });
  const thin = SNAPSHOT_HUBS.filter((hub) => books.typeCount(hub.stationId) < MIN_TYPES_PER_HUB);
  if (thin.length > 0) {
    throw new Error(
      `Hauling books: nothing published, too few types at ${thin.map((hub) => hub.id).join(', ')}`
    );
  }
  const lastSyncedAt = now();
  const failures: string[] = [];
  for (const hub of SNAPSHOT_HUBS) {
    try {
      const body = gzipSync(JSON.stringify(books.toObject(hub.stationId, { lastSyncedAt, asOf })));
      await deps.put(haulingBooksR2Key(hub.stationId), body, BOOK_HEADERS);
    } catch (error) {
      failures.push(`${hub.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // The record is only kept for a complete publish, so a later run repeats a partial one.
  if (failures.length > 0) {
    throw new Error(
      `Hauling books: ${failures.length} hubs failed to write: ${failures.join('; ')}`
    );
  }
  await deps.put(HAULING_BOOKS_STATE_R2_KEY, JSON.stringify({ asOf, lastSyncedAt }), STATE_HEADERS);
  console.info('Hauling books published', { asOf });
  return true;
}

export async function runPublicHaulingBooks(
  env: Record<string, string | undefined>
): Promise<void> {
  const config = r2ConfigFromEnv(env);
  await publishHaulingBooks({ get: createR2Get(config), put: createR2Put(config) });
}
