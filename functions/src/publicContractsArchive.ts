/**
 * Fetches and unpacks the EVE Ref public-contracts snapshot (ADR 0013): a
 * `.tar.bz2` with no CORS headers, refreshed twice hourly, containing (among
 * others) `contracts.csv` and `contract_items.csv`. This is the one impure
 * piece of the public-contracts sync — network + streaming decompression —
 * kept out of `publicContracts.ts` so that module stays fixture-testable.
 */
import { Readable } from 'node:stream';
import { extract as tarExtract } from 'tar-stream';
import unbzip2Stream from 'unbzip2-stream';

export const PUBLIC_CONTRACTS_ARCHIVE_URL =
  'https://data.everef.net/public-contracts/public-contracts-latest.v2.tar.bz2';

const WANTED_ENTRIES = new Set(['contracts.csv', 'contract_items.csv']);

export interface PublicContractsCsvs {
  contracts: string;
  contractItems: string;
}

/** Downloads and unpacks the archive, returning only the two CSVs this feature needs. */
export async function fetchPublicContractsCsvs(): Promise<PublicContractsCsvs> {
  const response = await fetch(PUBLIC_CONTRACTS_ARCHIVE_URL);
  if (!response.ok || !response.body) {
    throw new Error(`EVE Ref public-contracts fetch failed: HTTP ${response.status}`);
  }

  const files = new Map<string, string>();
  const extract = tarExtract();

  const extraction = new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, entryStream, next) => {
      if (!WANTED_ENTRIES.has(header.name)) {
        entryStream.resume();
        entryStream.on('end', next);
        entryStream.on('error', reject);
        return;
      }
      const chunks: Buffer[] = [];
      entryStream.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
      entryStream.on('end', () => {
        files.set(header.name, Buffer.concat(chunks).toString('utf8'));
        next();
      });
      entryStream.on('error', reject);
    });
    extract.on('finish', resolve);
    extract.on('error', reject);
  });

  Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>)
    .pipe(unbzip2Stream())
    .pipe(extract);

  await extraction;

  const contracts = files.get('contracts.csv');
  const contractItems = files.get('contract_items.csv');
  if (!contracts || !contractItems) {
    throw new Error('EVE Ref archive is missing contracts.csv or contract_items.csv');
  }
  return { contracts, contractItems };
}
