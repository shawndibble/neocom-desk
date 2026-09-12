/**
 * Pure decision logic behind the public-contract syncs (issue #608, ADR
 * 0013): parses EVE Ref's `contracts.csv` / `contract_items.csv`, joins them
 * down to the rows worth searching, and chunks the result for Firestore. The
 * `onSchedule` wiring — the archive fetch/decompress and the Firestore
 * writes — lives in index.ts, the same split `dispatchProjections.ts` and
 * `purgeFeed.ts` use, so this module is unit-testable from fixture CSV text
 * with no emulator.
 *
 * One snapshot comes out of it: `PublicContractOfferRow`, every for-sale
 * line of every public item_exchange/auction contract, any item type. A
 * second, blueprint-copies-only join used to sit alongside it feeding BPC
 * Sourcing its own collection; #907 retired that pipeline once BPC Sourcing
 * learned to take its blueprint slice out of this snapshot client-side, so
 * the archive is fetched once per cycle again rather than twice.
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
 * Deterministic order: a chunk's content should only change where the
 * underlying data changed, not from a CSV parse's incidental row order.
 */
function byContractThenType(
  a: { contractId: number; typeId: number },
  b: { contractId: number; typeId: number }
): number {
  return a.contractId - b.contractId || a.typeId - b.typeId;
}

/**
 * Fixed-size, order-preserving chunks. Pairs with a wholesale chunk-doc
 * replace in index.ts: writing chunk `i` for every `i < chunks.length` and
 * deleting any chunk doc at or past that count left over from a previous,
 * larger run is how a shrinking dataset doesn't leave stale chunks behind.
 */
export function chunkRows<T>(rows: readonly T[], chunkSize: number): T[][] {
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

/**
 * One searchable public-contract line: a `contract_items.csv` row joined to
 * its parent contract, for *any* item type rather than only blueprint copies
 * (issue #906). BPC Sourcing reads this shape too, taking its blueprint-copy
 * slice client-side (issue #907), so it is the only row shape this module
 * publishes.
 *
 * ME/TE/runs are blueprint-only columns, blank on a plain item line, and
 * `Number('')` is 0 rather than NaN — converting them unconditionally would
 * stamp `me: 0, te: 0, runs: 0` onto every ore stack in the snapshot: bytes
 * on the ~2/3 of rows that are not blueprints, and an "ME 0" filter that
 * matches all of them. Each is therefore carried only when the column
 * actually holds a number.
 *
 * That is a separate question from `isBlueprintCopy`, which is present only
 * when true and means *copy*, not *blueprint*. A blueprint original is a
 * plain row with no flag — but a researched BPO's ME/TE is real, saleable
 * information, so it rides along like any other blueprint's. `runs` does not:
 * a BPO's is `-1` ("infinite"), which is not a number any search should be
 * offered, so only a finite non-negative count is kept.
 */
export interface PublicContractOfferRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  quantity: number;
  isBlueprintCopy?: true;
  me?: number;
  te?: number;
  runs?: number;
  /** Epoch ms. */
  dateExpired: number;
}

/**
 * Joins one `contract_items.csv` record of any item type to its
 * already-narrowed parent, or null when the line is not offered for sale.
 *
 * `is_included` false means the item is what the contract issuer *wants*, not
 * what they're selling (an item_exchange contract can ask for one item and
 * offer another). That filter stays: this snapshot answers "what can I buy",
 * and a line the issuer is asking for is not an offer at any price. Issue
 * #906 generalizes the *item type* — the `is_blueprint_copy` gate — not the
 * direction of the exchange.
 */
export function compactContractOfferRow(
  item: ContractItemRecord,
  contract: EligibleContract
): PublicContractOfferRow | null {
  if (item.is_included !== 'true') return null;

  const me = blueprintColumn(item.material_efficiency);
  const te = blueprintColumn(item.time_efficiency);
  const runs = blueprintColumn(item.runs);

  return {
    contractId: contract.contractId,
    regionId: contract.regionId,
    locationId: contract.locationId,
    typeId: Number(item.type_id),
    price: contract.price,
    ...(contract.buyout === undefined ? {} : { buyout: contract.buyout }),
    isAuction: contract.isAuction,
    quantity: Number(item.quantity),
    ...(item.is_blueprint_copy === 'true' ? { isBlueprintCopy: true as const } : {}),
    ...(me === undefined ? {} : { me }),
    ...(te === undefined ? {} : { te }),
    ...(runs === undefined || runs < 0 ? {} : { runs }),
    dateExpired: contract.dateExpired,
  };
}

/** One of the blueprint-only CSV columns: a number, or absent (blank or unparsable). */
function blueprintColumn(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Deterministic order, in place. `byContractThenType` alone is not a total
 * order here the way it effectively was on the blueprint-only rows: one
 * contract routinely lists the same type twice — two stacks of the same ore,
 * two copies of one blueprint at different ME — and a tie there falls back to
 * the CSV's incidental row order, which is what the sort exists to defeat.
 * Tie-breaking down to the last distinguishing field means the only rows left
 * in an unspecified order are ones that serialize identically, so the chunk
 * doc's content is the same either way.
 */
export function sortContractOfferRows(rows: PublicContractOfferRow[]): PublicContractOfferRow[] {
  return rows.sort(
    (a, b) =>
      byContractThenType(a, b) ||
      a.quantity - b.quantity ||
      (a.me ?? -1) - (b.me ?? -1) ||
      (a.te ?? -1) - (b.te ?? -1) ||
      (a.runs ?? -1) - (b.runs ?? -1)
  );
}

/**
 * The whole join in one call, over already-parsed records: narrow the
 * contracts to a lookup, then hand every item that matches one to
 * `compactContractOfferRow`, which decides whether the line is worth a row.
 * The scheduled sync drives those per-row seams directly instead — it never
 * holds either record array — so this stays as the composed,
 * fixture-testable statement of what that streaming pass adds up to.
 */
export function filterAndCompactPublicContractOffers(
  contracts: readonly ContractRecord[],
  items: readonly ContractItemRecord[],
  nowMs: number
): PublicContractOfferRow[] {
  const eligibleContracts = new Map<string, EligibleContract>();
  for (const contract of contracts) {
    const eligible = eligibleContractFrom(contract, nowMs);
    if (eligible) eligibleContracts.set(contract.contract_id, eligible);
  }

  const rows: PublicContractOfferRow[] = [];
  for (const item of items) {
    const contract = eligibleContracts.get(item.contract_id);
    if (!contract) continue;
    const row = compactContractOfferRow(item, contract);
    if (row) rows.push(row);
  }

  return sortContractOfferRows(rows);
}

/**
 * 3,000 rows/chunk, against the 2,000 the retired blueprint-only snapshot
 * used. Both limits this sits between are shared, and this snapshot holds
 * ~3x the rows that one did:
 *
 * - Firestore's 1MiB per document. The blueprint snapshot measured ~370KB per
 *   2,000 rows (~185 bytes/row); a blueprint row here carries an extra
 *   `isBlueprintCopy` field on top of that, so ~210 bytes/row is the expected
 *   blueprint case and most rows are smaller (plain items carry no ME/TE/runs
 *   at all). The binding number is the *widest* row this shape can produce,
 *   which `publicContracts.test.ts` measures rather than assumes — so a later
 *   field addition fails that test before it fails a live `set()`.
 * - The free tier's 20,000 writes/day, which is the *project's* budget, not
 *   this job's: `dispatchProjections` runs 288x/day beside it. At ~370k rows
 *   this chunks to ~124 docs x 48 runs/day ≈ 6.0k writes. Keeping 2,000 here
 *   would have cost ~8.9k for this job alone.
 */
export const PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE = 3000;

export const PUBLIC_CONTRACT_OFFERS_COLLECTION = 'publicContractOffers';
export const PUBLIC_CONTRACT_OFFERS_META_DOC = 'meta';
