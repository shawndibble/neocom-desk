/**
 * Pure decision logic behind the public BPC contract sync (issue #608, ADR
 * 0013): parses EVE Ref's `contracts.csv` / `contract_items.csv`, joins them
 * down to the rows worth searching, and chunks the result for Firestore. The
 * `onSchedule` wiring — the archive fetch/decompress and the Firestore
 * writes — lives in index.ts, the same split `dispatchProjections.ts` and
 * `purgeFeed.ts` use, so this module is unit-testable from fixture CSV text
 * with no emulator.
 *
 * Column names and sample values are pinned against a live EVE Ref
 * `public-contracts-latest.v2.tar.bz2` pull (2026-09-08, ~50k public
 * contracts, ~23k of them carrying at least one for-sale blueprint copy) —
 * see ADR 0013 and `publicContracts.test.ts`.
 */
import { parse } from 'csv-parse/sync';

export interface ContractRecord {
  contract_id: string;
  date_expired: string;
  price: string;
  buyout: string;
  start_location_id: string;
  title: string;
  type: string;
  region_id: string;
}

export interface ContractItemRecord {
  is_blueprint_copy: string;
  is_included: string;
  material_efficiency: string;
  quantity: string;
  runs: string;
  time_efficiency: string;
  type_id: string;
  contract_id: string;
}

/** One searchable BPC-for-sale row: a contract_items.csv row joined to its parent contract. */
export interface BpcContractRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  me: number;
  te: number;
  runs: number;
  quantity: number;
  /** Epoch ms. */
  dateExpired: number;
}

export function parseContractsCsv(csvText: string): ContractRecord[] {
  return parse(csvText, { columns: true, skip_empty_lines: true }) as ContractRecord[];
}

export function parseContractItemsCsv(csvText: string): ContractItemRecord[] {
  return parse(csvText, { columns: true, skip_empty_lines: true }) as ContractItemRecord[];
}

/**
 * `contracts.csv` carries no `status` field at all — EVE Ref's source, ESI's
 * `/contracts/public/{region_id}/`, only ever lists outstanding public
 * contracts, so every row here already is one. Only item_exchange and
 * auction contracts carry a priced item worth searching; courier and loan
 * contracts move nothing a buyer browses by type.
 */
const SEARCHABLE_CONTRACT_TYPES = new Set(['item_exchange', 'auction']);

/**
 * Joins BPC item rows to their eligible, unexpired parent contract and
 * compacts the result. `is_included` false means the item is what the
 * *contract issuer wants*, not what they're selling (an item_exchange
 * contract can ask for one item and offer another) — excluded, since this
 * feature searches BPCs for sale, not BPCs wanted.
 *
 * `nowMs` filters out a contract that lapsed between EVE Ref's scrape (up to
 * ~30 minutes stale, per its own twice-hourly cadence) and this job's run —
 * an "outstanding" row in the CSV is not a guarantee it still is one.
 */
export function filterAndCompactBpcContracts(
  contracts: readonly ContractRecord[],
  items: readonly ContractItemRecord[],
  nowMs: number
): BpcContractRow[] {
  const eligibleContracts = new Map<string, ContractRecord>();
  for (const contract of contracts) {
    if (SEARCHABLE_CONTRACT_TYPES.has(contract.type)) {
      eligibleContracts.set(contract.contract_id, contract);
    }
  }

  const rows: BpcContractRow[] = [];
  for (const item of items) {
    if (item.is_blueprint_copy !== 'true' || item.is_included !== 'true') continue;
    const contract = eligibleContracts.get(item.contract_id);
    if (!contract) continue;

    const dateExpired = Date.parse(contract.date_expired);
    if (!Number.isFinite(dateExpired) || dateExpired <= nowMs) continue;

    const buyout = contract.buyout === '' ? NaN : Number(contract.buyout);
    rows.push({
      contractId: Number(contract.contract_id),
      regionId: Number(contract.region_id),
      locationId: Number(contract.start_location_id),
      typeId: Number(item.type_id),
      price: Number(contract.price),
      ...(Number.isFinite(buyout) ? { buyout } : {}),
      isAuction: contract.type === 'auction',
      me: Number(item.material_efficiency),
      te: Number(item.time_efficiency),
      runs: Number(item.runs),
      quantity: Number(item.quantity),
      dateExpired,
    });
  }

  // Deterministic order: a chunk's content should only change where the
  // underlying data changed, not from a CSV parse's incidental row order.
  rows.sort((a, b) => a.contractId - b.contractId || a.typeId - b.typeId);
  return rows;
}

/**
 * ~2,000 rows/chunk keeps a chunk doc comfortably under Firestore's 1MiB
 * limit (measured well under 400KB against the live 2026-09-08 pull) while
 * keeping the chunk count — and so the per-sync write count — small: the
 * ~123k BPC rows seen that day chunk to roughly 65 docs, not thousands.
 */
export const DEFAULT_CHUNK_SIZE = 2000;

/**
 * Fixed-size, order-preserving chunks. Pairs with a wholesale chunk-doc
 * replace in index.ts: writing chunk `i` for every `i < chunks.length` and
 * deleting any chunk doc at or past that count left over from a previous,
 * larger run is how a shrinking dataset doesn't leave stale chunks behind.
 */
export function chunkRows<T>(rows: readonly T[], chunkSize: number = DEFAULT_CHUNK_SIZE): T[][] {
  if (chunkSize <= 0) throw new Error('chunkSize must be positive');
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
}

/** Zero-padded so lexicographic (Firestore query) and numeric chunk order agree. */
export function chunkDocId(index: number): string {
  return `chunk-${String(index).padStart(4, '0')}`;
}

export const PUBLIC_BPC_CONTRACTS_COLLECTION = 'publicBpcContracts';
export const PUBLIC_BPC_CONTRACTS_META_DOC = 'meta';
