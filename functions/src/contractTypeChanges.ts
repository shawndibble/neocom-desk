import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { PublicContractOfferRow } from './publicContracts.js';

const HASH_LENGTH = 16;

export type ContractTypeHashes = Record<string, string>;

export interface ContractTypeChangeStats {
  typeCount: number;
  rowCount: number;
  changedTypeCount: number;
  totalBytes: number;
  totalGzipBytes: number;
  largestTypeRows: number;
  largestTypeBytes: number;
}

export function measureContractTypeChanges(
  rows: readonly PublicContractOfferRow[],
  previous: ContractTypeHashes | null
): { stats: ContractTypeChangeStats; hashes: ContractTypeHashes } {
  const byType = new Map<number, string[]>();
  for (const row of rows) {
    const json = JSON.stringify(row);
    const list = byType.get(row.typeId);
    if (list) list.push(json);
    else byType.set(row.typeId, [json]);
  }

  const hashes: ContractTypeHashes = {};
  let totalBytes = 0;
  let totalGzipBytes = 0;
  let largestTypeRows = 0;
  let largestTypeBytes = 0;
  let changedTypeCount = 0;
  for (const [typeId, jsonRows] of byType) {
    const body = `[${jsonRows.sort().join(',')}]`;
    const bytes = Buffer.byteLength(body);
    const key = String(typeId);
    hashes[key] = createHash('sha256').update(body).digest('hex').slice(0, HASH_LENGTH);
    if (previous?.[key] !== hashes[key]) changedTypeCount += 1;
    totalBytes += bytes;
    totalGzipBytes += gzipSync(body).length;
    if (jsonRows.length > largestTypeRows) largestTypeRows = jsonRows.length;
    if (bytes > largestTypeBytes) largestTypeBytes = bytes;
  }
  if (previous) {
    for (const key of Object.keys(previous)) if (!(key in hashes)) changedTypeCount += 1;
  }

  return {
    stats: {
      typeCount: byType.size,
      rowCount: rows.length,
      changedTypeCount,
      totalBytes,
      totalGzipBytes,
      largestTypeRows,
      largestTypeBytes,
    },
    hashes,
  };
}
