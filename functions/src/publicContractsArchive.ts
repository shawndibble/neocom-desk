import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { extract as tarExtract } from 'tar-stream';
import unbzip2Stream from 'unbzip2-stream';
import type { ContractRecord, ContractItemRecord } from './publicContracts.js';

export const PUBLIC_CONTRACTS_ARCHIVE_URL =
  'https://data.everef.net/public-contracts/public-contracts-latest.v2.tar.bz2';

const CONTRACTS_ENTRY = 'contracts.csv';
const ITEMS_ENTRY = 'contract_items.csv';

export interface ContractsCsvHandlers {
  onContract(record: ContractRecord): void;
  onItem(record: ContractItemRecord): void;
}

function csvRows(entry: AsyncIterable<unknown>): AsyncIterable<unknown> {
  return Readable.from(entry).pipe(parse({ columns: true, skip_empty_lines: true }));
}

export async function streamContractsCsvEntries(
  source: Readable,
  handlers: ContractsCsvHandlers
): Promise<void> {
  const extract = tarExtract();
  let seenContracts = false;
  let seenItems = false;

  source.pipe(extract as unknown as NodeJS.WritableStream);

  try {
    for await (const entry of extract) {
      if (entry.header.name === CONTRACTS_ENTRY) {
        for await (const record of csvRows(entry)) {
          handlers.onContract(record as ContractRecord);
        }
        seenContracts = true;
      } else if (entry.header.name === ITEMS_ENTRY) {
        if (!seenContracts) {
          throw new Error(
            `EVE Ref archive lists ${ITEMS_ENTRY} before ${CONTRACTS_ENTRY}; ` +
              'the single-pass join needs the contracts entry first'
          );
        }
        for await (const record of csvRows(entry)) {
          handlers.onItem(record as ContractItemRecord);
        }
        seenItems = true;
      } else {
        entry.resume();
      }

      if (seenContracts && seenItems) break;
    }
  } finally {
    source.destroy();
  }

  if (!seenContracts || !seenItems) {
    const missing = [
      ...(seenContracts ? [] : [CONTRACTS_ENTRY]),
      ...(seenItems ? [] : [ITEMS_ENTRY]),
    ];
    throw new Error(`EVE Ref archive is missing ${missing.join(' and ')}`);
  }
}

export function archiveFingerprint(headers: Headers): string | null {
  const etag = headers.get('etag');
  if (etag) return `etag:${etag}`;
  const modified = headers.get('last-modified');
  if (modified) return `modified:${modified}`;
  return null;
}

export async function fetchArchiveFingerprint(): Promise<string | null> {
  try {
    const response = await fetch(PUBLIC_CONTRACTS_ARCHIVE_URL, { method: 'HEAD' });
    return response.ok ? archiveFingerprint(response.headers) : null;
  } catch {
    return null;
  }
}

export async function streamPublicContractsCsvs(handlers: ContractsCsvHandlers): Promise<void> {
  const response = await fetch(PUBLIC_CONTRACTS_ARCHIVE_URL);
  if (!response.ok || !response.body) {
    throw new Error(`EVE Ref public-contracts fetch failed: HTTP ${response.status}`);
  }

  const compressed = Readable.fromWeb(
    response.body as import('node:stream/web').ReadableStream<Uint8Array>
  );
  await streamContractsCsvEntries(compressed.pipe(unbzip2Stream()), handlers);
}
