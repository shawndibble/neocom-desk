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
 * Everything the join needs from one contract, already converted — and
 * nothing else. `contracts.csv` carries 21 columns and `columns: true` builds
 * an object holding every one of them; keeping whole records alive as the
 * lookup table is part of what made this sync's memory scale with the
 * *archive* rather than with the ~50k contracts it actually indexes.
 */
export interface EligibleContract {
  contractId: number;
  regionId: number;
  locationId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  /** Epoch ms. */
  dateExpired: number;
}

/**
 * Narrows one `contracts.csv` record to an `EligibleContract`, or null when
 * the contract is not worth indexing.
 *
 * `nowMs` drops a contract that lapsed between EVE Ref's scrape (up to ~30
 * minutes stale, per its own twice-hourly cadence) and this job's run — an
 * "outstanding" row in the CSV is not a guarantee it still is one. Checking
 * expiry here rather than once per item is the same filter one level up:
 * every item on a lapsed contract was already being discarded.
 */
export function eligibleContractFrom(
  contract: ContractRecord,
  nowMs: number
): EligibleContract | null {
  if (!SEARCHABLE_CONTRACT_TYPES.has(contract.type)) return null;

  const dateExpired = Date.parse(contract.date_expired);
  if (!Number.isFinite(dateExpired) || dateExpired <= nowMs) return null;

  const buyout = contract.buyout === '' ? NaN : Number(contract.buyout);
  return {
    contractId: Number(contract.contract_id),
    regionId: Number(contract.region_id),
    locationId: Number(contract.start_location_id),
    price: Number(contract.price),
    ...(Number.isFinite(buyout) ? { buyout } : {}),
    isAuction: contract.type === 'auction',
    dateExpired,
  };
}

/**
 * Joins one `contract_items.csv` record to its already-narrowed parent, or
 * null when the item is not a BPC offered for sale. `is_included` false means
 * the item is what the *contract issuer wants*, not what they're selling (an
 * item_exchange contract can ask for one item and offer another) — excluded,
 * since this feature searches BPCs for sale, not BPCs wanted.
 */
export function compactBpcItemRow(
  item: ContractItemRecord,
  contract: EligibleContract
): BpcContractRow | null {
  if (item.is_blueprint_copy !== 'true' || item.is_included !== 'true') return null;

  return {
    contractId: contract.contractId,
    regionId: contract.regionId,
    locationId: contract.locationId,
    typeId: Number(item.type_id),
    price: contract.price,
    ...(contract.buyout === undefined ? {} : { buyout: contract.buyout }),
    isAuction: contract.isAuction,
    me: Number(item.material_efficiency),
    te: Number(item.time_efficiency),
    runs: Number(item.runs),
    quantity: Number(item.quantity),
    dateExpired: contract.dateExpired,
  };
}

/**
 * Deterministic order, in place: a chunk's content should only change where
 * the underlying data changed, not from a CSV parse's incidental row order.
 */
export function sortBpcRows(rows: BpcContractRow[]): BpcContractRow[] {
  return rows.sort((a, b) => a.contractId - b.contractId || a.typeId - b.typeId);
}

/**
 * The whole join in one call, over already-parsed records. The scheduled sync
 * drives the per-row seams above directly instead — it never holds either
 * record array — so this stays as the composed, fixture-testable statement of
 * what that streaming pass adds up to.
 */
export function filterAndCompactBpcContracts(
  contracts: readonly ContractRecord[],
  items: readonly ContractItemRecord[],
  nowMs: number
): BpcContractRow[] {
  const eligibleContracts = new Map<string, EligibleContract>();
  for (const contract of contracts) {
    const eligible = eligibleContractFrom(contract, nowMs);
    if (eligible) eligibleContracts.set(contract.contract_id, eligible);
  }

  const rows: BpcContractRow[] = [];
  for (const item of items) {
    const contract = eligibleContracts.get(item.contract_id);
    if (!contract) continue;
    const row = compactBpcItemRow(item, contract);
    if (row) rows.push(row);
  }

  return sortBpcRows(rows);
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
