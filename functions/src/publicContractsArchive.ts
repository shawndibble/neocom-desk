/**
 * Fetches and unpacks the EVE Ref public-contracts snapshot (ADR 0013): a
 * `.tar.bz2` with no CORS headers, refreshed twice hourly, containing (among
 * others) `contracts.csv` and `contract_items.csv`. This is the one impure
 * piece of the public-contracts sync — network + streaming decompression —
 * kept out of `publicContracts.ts` so that module stays fixture-testable.
 *
 * Rows are handed to callbacks one at a time rather than returned as CSV
 * text. Buffering the two entries and parsing them whole cost ~1.1GB of heap
 * for 37MB of text — `columns: true` builds an object per row carrying all 21
 * (contracts) or 11 (items) columns, and both record arrays were live at once
 * — which OOM'd the 1GiB function on every scheduled run since deploy.
 * Streaming keeps only the caller's own accumulator resident.
 */
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

/**
 * tar-stream v3 is built on streamx, whose streams honour Node's stream
 * contract at runtime but are not structurally assignable to Node's types.
 * Going through the async-iterable side of both keeps the interop to this one
 * function instead of a cast at every use.
 */
function csvRows(entry: AsyncIterable<unknown>): AsyncIterable<unknown> {
  return Readable.from(entry).pipe(parse({ columns: true, skip_empty_lines: true }));
}

/**
 * Reads an already-decompressed tar stream, dispatching the rows of the two
 * entries this feature needs and skipping the rest.
 *
 * The archive orders `contracts.csv` before `contract_items.csv`, which is
 * what lets a single pass work: the contract lookup is complete by the time
 * the first item row arrives. That ordering is EVE Ref's to change, so a
 * flipped archive throws rather than quietly producing an empty snapshot —
 * silence there is indistinguishable from "nobody is selling any BPCs".
 */
export async function streamContractsCsvEntries(
  source: Readable,
  handlers: ContractsCsvHandlers
): Promise<void> {
  const extract = tarExtract();
  let seenContracts = false;
  let seenItems = false;

  // See csvRows: streamx and Node stream types don't line up, though the
  // runtime contract does.
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

      // Everything after contract_items.csv is ~19MB of dynamic-item data
      // this feature never reads, so stop before decompressing any of it.
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

/** Downloads the archive and streams its rows through `streamContractsCsvEntries`. */
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
