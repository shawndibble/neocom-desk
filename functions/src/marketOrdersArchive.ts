/**
 * The impure edge of the open-prices sync: fetch one EVE Ref market-order
 * snapshot (`.csv.bz2`, ~20MB compressed, every order in every region),
 * decompress it as a stream and fold the rows into an `OpenPriceFold`.
 *
 * Nothing is buffered: rows are parsed as arrays (not one object per row) and
 * folded one at a time, so only the fold's per-type map stays resident. Shared
 * by the daily function and scripts/backfill-market-open-prices.mjs, which
 * runs it under Node's type stripping, so: relative imports are type-only and
 * there are no enums or parameter properties here.
 */
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import unbzip2Stream from 'unbzip2-stream';
import type { OpenPriceFold } from './marketOpenPrices.js';

const REQUIRED_COLUMNS = ['is_buy_order', 'price', 'type_id', 'region_id'] as const;

/** Folds a decompressed snapshot CSV into `fold`; returns the data rows read. Throws when a required column is missing. */
export async function foldOrdersCsv(csv: Readable, fold: OpenPriceFold): Promise<number> {
  const rows = csv.pipe(parse({ skip_empty_lines: true, relax_column_count: true }));
  let columns: Record<(typeof REQUIRED_COLUMNS)[number], number> | null = null;
  let count = 0;
  for await (const row of rows as AsyncIterable<string[]>) {
    if (!columns) {
      const index = (name: string) => row.indexOf(name);
      const found = REQUIRED_COLUMNS.map(index);
      if (found.some((i) => i < 0)) {
        csv.destroy();
        throw new Error(
          `market-order snapshot is missing a column of ${REQUIRED_COLUMNS.join(', ')}`
        );
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
    fold.add(
      Number(row[columns.region_id]),
      Number(row[columns.type_id]),
      row[columns.is_buy_order] === 'true',
      Number(row[columns.price])
    );
  }
  return count;
}

export async function fetchJson(url: string, userAgent: string): Promise<unknown | null> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/** Downloads one snapshot and folds it. Returns the data rows read. */
export async function foldSnapshotUrl(
  url: string,
  fold: OpenPriceFold,
  userAgent: string
): Promise<number> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok || !response.body) {
    throw new Error(`EVE Ref market-orders fetch failed: HTTP ${response.status}`);
  }
  const compressed = Readable.fromWeb(
    response.body as import('node:stream/web').ReadableStream<Uint8Array>
  );
  const csv = compressed.pipe(unbzip2Stream());
  compressed.on('error', (err) => csv.destroy(err));
  return foldOrdersCsv(csv, fold);
}
