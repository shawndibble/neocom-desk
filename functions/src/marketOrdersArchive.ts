/**
 * The impure edge of the open-prices sync: fetch one EVE Ref market-order
 * snapshot (`.csv.bz2`, ~20MB compressed, every order in every region),
 * decompress it as a stream and fold the rows into an `OpenPriceFold`.
 *
 * Nothing is buffered: rows are parsed as arrays (not one object per row) and
 * folded one at a time, so only the fold's per-type map stays resident. Shared
 * by the daily function.
 */
import { Readable, pipeline } from 'node:stream';
import { parse } from 'csv-parse';
import unbzip2Stream from 'unbzip2-stream';
import type { HaulingBookFold } from './haulingBooks.js';
import type { OpenPriceFold, StationPriceFold } from './marketOpenPrices.js';

const REQUIRED_COLUMNS = ['is_buy_order', 'price', 'type_id', 'region_id'] as const;
/** Read only when a station fold rides along (the daily job and the backfill). */
const LOCATION_COLUMN = 'location_id';

/**
 * EVE Ref writes `true` / `false`; any casing of those is accepted. Anything
 * else throws, so an unexpected format fails the run instead of silently
 * turning every order into a sell.
 */
export function parseIsBuy(value: string | undefined): boolean {
  const v = value?.toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`market-order snapshot has an unexpected is_buy_order value: ${String(value)}`);
}

function snapshotCsvParser() {
  return parse({ skip_empty_lines: true, relax_column_count: true });
}

/**
 * Folds a decompressed snapshot CSV into `fold`, and into `stations` too when
 * given (the same single pass); returns the data rows read. Throws when a
 * required column is missing.
 */
export function foldOrdersCsv(
  csv: Readable,
  fold: OpenPriceFold,
  stations?: StationPriceFold
): Promise<number> {
  // pipeline, not pipe: an error in the source (a dropped download, a corrupt
  // bzip2 block) destroys the parser with that error, so the loop rejects
  // instead of hanging or ending as if the file were complete.
  const rows = snapshotCsvParser();
  pipeline(csv, rows, () => {});
  return foldRows(rows, fold, stations);
}

/**
 * Decompresses a `.csv.bz2` snapshot stream and folds it into `fold`. One
 * pipeline through all three streams, not one pipeline into the decompressor
 * and a second out of it: unbzip2-stream is a legacy `Stream`, and two
 * pipelines plus their `pipe` calls put 11 `close` listeners on it (Node's
 * MaxListenersExceededWarning on every run); one pipeline puts 9.
 */
export function foldBz2Snapshot(
  compressed: Readable,
  fold: OpenPriceFold,
  stations?: StationPriceFold
): Promise<number> {
  const rows = snapshotCsvParser();
  pipeline(compressed, unbzip2Stream(), rows, () => {});
  return foldRows(rows, fold, stations);
}

/** `rows` sits at the end of a pipeline, so destroying it tears the whole pipeline down. */
async function foldRows(
  rows: ReturnType<typeof snapshotCsvParser>,
  fold: OpenPriceFold,
  stations?: StationPriceFold
): Promise<number> {
  let columns: Record<(typeof REQUIRED_COLUMNS)[number], number> | null = null;
  let location = -1;
  let count = 0;
  for await (const row of rows as AsyncIterable<string[]>) {
    if (!columns) {
      const index = (name: string) => row.indexOf(name);
      const found = REQUIRED_COLUMNS.map(index);
      if (found.some((i) => i < 0)) {
        rows.destroy();
        throw new Error(
          `market-order snapshot is missing a column of ${REQUIRED_COLUMNS.join(', ')}`
        );
      }
      if (stations) {
        location = row.indexOf(LOCATION_COLUMN);
        if (location < 0) {
          rows.destroy();
          throw new Error(`market-order snapshot is missing the ${LOCATION_COLUMN} column`);
        }
      }
      columns = {
        is_buy_order: found[0],
        price: found[1],
        type_id: found[2],
        region_id: found[3],
      };
      continue;
    }
    count++;
    const typeId = Number(row[columns.type_id]);
    const isBuy = parseIsBuy(row[columns.is_buy_order]);
    const price = Number(row[columns.price]);
    fold.add(Number(row[columns.region_id]), typeId, isBuy, price);
    stations?.add(Number(row[location]), typeId, isBuy, price);
  }
  return count;
}

export async function fetchJson(url: string, userAgent: string): Promise<unknown | null> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/** Downloads one snapshot and folds it (and `stations`, in the same pass). Returns the data rows read. */
export async function foldSnapshotUrl(
  url: string,
  fold: OpenPriceFold,
  userAgent: string,
  stations?: StationPriceFold
): Promise<number> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok || !response.body) {
    throw new Error(`EVE Ref market-orders fetch failed: HTTP ${response.status}`);
  }
  return foldBz2Snapshot(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
    fold,
    stations
  );
}

const BOOK_COLUMNS = ['is_buy_order', 'price', 'type_id', 'location_id', 'volume_remain'] as const;

/** Folds a decompressed snapshot CSV into `books` by column name; returns the data rows read. */
export async function foldOrderBooksCsv(csv: Readable, books: HaulingBookFold): Promise<number> {
  const rows = snapshotCsvParser();
  pipeline(csv, rows, () => {});
  return foldBookRows(rows, books);
}

async function foldBookRows(
  rows: ReturnType<typeof snapshotCsvParser>,
  books: HaulingBookFold
): Promise<number> {
  let at: number[] | null = null;
  let count = 0;
  for await (const row of rows as AsyncIterable<string[]>) {
    if (!at) {
      const found = BOOK_COLUMNS.map((name) => row.indexOf(name));
      if (found.some((i) => i < 0)) {
        rows.destroy();
        throw new Error(`market-order snapshot is missing a column of ${BOOK_COLUMNS.join(', ')}`);
      }
      at = found;
      continue;
    }
    count++;
    books.add(
      Number(row[at[3]]),
      Number(row[at[2]]),
      parseIsBuy(row[at[0]]),
      Number(row[at[1]]),
      Number(row[at[4]])
    );
  }
  return count;
}

/** Downloads one snapshot into `books`. Returns the data rows read and when EVE Ref published it (ms; null if not stated). */
export async function foldOrderBooksUrl(
  url: string,
  books: HaulingBookFold,
  userAgent: string
): Promise<{ rows: number; publishedAt: number | null }> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok || !response.body) {
    throw new Error(`EVE Ref market-orders fetch failed: HTTP ${response.status}`);
  }
  const modified = Date.parse(response.headers.get('last-modified') ?? '');
  const expectedBytes = Number(response.headers.get('content-length'));
  const compressed = Readable.fromWeb(
    response.body as import('node:stream/web').ReadableStream<Uint8Array>
  );
  let receivedBytes = 0;
  compressed.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
  });
  const rows = snapshotCsvParser();
  pipeline(compressed, unbzip2Stream(), rows, () => {});
  const count = await foldBookRows(rows, books);
  // unbzip2-stream ends quietly on a cut stream: a short body must fail the run, not publish a partial book.
  if (expectedBytes > 0 && receivedBytes !== expectedBytes) {
    throw new Error(
      `EVE Ref market-orders download was cut short (${receivedBytes} of ${expectedBytes} bytes)`
    );
  }
  return { rows: count, publishedAt: Number.isFinite(modified) ? modified : null };
}
