/**
 * Pure decision logic behind the public-contract syncs (issue #608, ADR
 * 0013): parses EVE Ref's `contracts.csv` / `contract_items.csv`, joins them
 * down to the rows worth searching. The `onSchedule` wiring — the archive
 * fetch/decompress and the R2 publish (`r2Publisher.ts`) — lives in index.ts, the same split `dispatchProjections.ts` and
 * `purgeFeed.ts` use, so this module is unit-testable from fixture CSV text
 * with no emulator.
 *
 * Two snapshots come out of it, off that one pass. `PublicContractOfferRow`
 * is every for-sale line of every public item_exchange/auction contract, any
 * item type. A second, blueprint-copies-only join used to sit alongside it
 * feeding BPC Sourcing its own collection; #907 retired that pipeline once BPC
 * Sourcing learned to take its blueprint slice out of this snapshot
 * client-side, so the archive is fetched once per cycle again rather than
 * twice.
 *
 * `PublicCourierContractRow` (issue #909) is the second: public courier
 * contracts, which carry no item lines at all and so are a route and a fee
 * rather than a priced item. It is a separate snapshot because it is a
 * separate row shape — not because it needs a separate crawl, which is the
 * mistake #907 undid.
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
  end_location_id: string;
  reward: string;
  collateral: string;
  volume: string;
  days_to_complete: string;
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
 * PLEX's type id, checked against `contract_items.csv`'s requested (not
 * offered) lines to flag a barter contract that wants PLEX in return (issue
 * #1080's "unpriceable" barter, specialized). Not imported from `src/engine`
 * — client and Functions are separate packages — so this is Functions' own
 * copy of the same constant.
 */
const PLEX_TYPE_ID = 44992;

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
 * Deterministic order: a published snapshot should only change where the
 * underlying data changed, not from a CSV parse's incidental row order.
 */
function byContractThenType(
  a: { contractId: number; typeId: number },
  b: { contractId: number; typeId: number }
): number {
  return a.contractId - b.contractId || a.typeId - b.typeId;
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
  /**
   * How much PLEX the contract's issuer wants in return, when any — the sum
   * of PLEX quantity across the contract's *requested* (`is_included:
   * false`) lines, set by `applyRequestedSide`. The same value on
   * every offer row of one contract, since the requested side belongs to the
   * whole contract, not to any one for-sale line. Absent, not zero, when the
   * contract asks for nothing PLEX — the same omit-don't-zero rule ME/TE/runs
   * already follow.
   */
  requestedPlex?: number;
  /**
   * Issuer wants at least one non-PLEX item in return (issue #3986); per
   * contract, like `requestedPlex`. Only yes/no is kept: enough for a value
   * comparison to drop the contract (items for 1 ISK that also asks for items
   * is bait, not a deal). Absent, not false, otherwise.
   */
  requestsItems?: true;
  /**
   * For-sale lines in the contract (one per stack: two stacks of one type are
   * two lines), the same on every offer row of one contract, set by
   * `applyLineCounts`. Always written, one included: a reader only ever sees
   * the rows of the types it searched, so an absent count has to mean "an
   * older publish", never "a single-line contract".
   */
  lineCount?: number;
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
 * direction of the exchange. What the issuer asks for in return rides along
 * on the offer rows this function publishes, patched on afterwards by
 * `applyRequestedSide`, since answering it needs every item line of the
 * contract, not the one this call is narrowing.
 */
export function compactContractOfferRow(
  item: ContractItemRecord,
  contract: EligibleContract
): PublicContractOfferRow | null {
  if (item.is_included !== 'true') return null;

  const me = numericColumn(item.material_efficiency);
  const te = numericColumn(item.time_efficiency);
  const runs = numericColumn(item.runs);

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

/**
 * What eligible contracts ask for in return, keyed by raw CSV `contract_id`
 * (matching `eligibleContracts`' own keys): PLEX quantity per contract (issue
 * #1080's PLEX-for-item barter), and which contracts ask for any non-PLEX item.
 */
export interface RequestedSide {
  plex: Map<string, number>;
  items: Set<string>;
}

export function emptyRequestedSide(): RequestedSide {
  return { plex: new Map(), items: new Set() };
}

/**
 * Folds one `contract_items.csv` line into `side`. A no-op unless the line is
 * on the requested (`is_included: false`) side of an already-eligible contract
 * — an ineligible or lapsed contract publishes no offer rows to carry it.
 *
 * Exposed on its own so the production sync's single streaming pass over
 * `contract_items.csv` (`index.ts`'s `syncPublicContractOffers`, which cannot
 * hold the whole `items` array — see `publicContractsArchive.ts`'s doc
 * comment) can fold every line as it streams past instead of a second pass.
 */
export function accumulateRequestedSide(
  item: ContractItemRecord,
  eligibleContracts: ReadonlyMap<string, EligibleContract>,
  side: RequestedSide
): void {
  if (item.is_included === 'true') return;
  if (!eligibleContracts.has(item.contract_id)) return;
  if (Number(item.type_id) !== PLEX_TYPE_ID) {
    side.items.add(item.contract_id);
    return;
  }
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  side.plex.set(item.contract_id, (side.plex.get(item.contract_id) ?? 0) + quantity);
}

/**
 * The requested side over every item line up front — a contract's requested
 * lines are not guaranteed to sit next to its offered ones in the CSV.
 */
export function requestedSideByContract(
  items: readonly ContractItemRecord[],
  eligibleContracts: ReadonlyMap<string, EligibleContract>
): RequestedSide {
  const side = emptyRequestedSide();
  for (const item of items) accumulateRequestedSide(item, eligibleContracts, side);
  return side;
}

/**
 * Stamps `requestedPlex` and `requestsItems` onto every offer row of the
 * contracts `side` names, in place. Absent, not zero/false, on the rest.
 */
export function applyRequestedSide(rows: PublicContractOfferRow[], side: RequestedSide): void {
  if (side.plex.size === 0 && side.items.size === 0) return;
  for (const row of rows) {
    const contractId = String(row.contractId);
    const requestedPlex = side.plex.get(contractId);
    if (requestedPlex) row.requestedPlex = requestedPlex;
    if (side.items.has(contractId)) row.requestsItems = true;
  }
}

/**
 * Stamps `lineCount` onto every offer row, in place: how many for-sale lines
 * its contract carries. One price pays for every line, so a contract with more
 * than one (other types, or two stacks of one) cannot be judged from a single
 * row. Needs every row of every contract, so it runs once after the stream.
 */
export function applyLineCounts(rows: PublicContractOfferRow[]): void {
  const linesByContract = new Map<number, number>();
  for (const row of rows) {
    linesByContract.set(row.contractId, (linesByContract.get(row.contractId) ?? 0) + 1);
  }
  for (const row of rows) row.lineCount = linesByContract.get(row.contractId)!;
}

/** One CSV column as a number, or absent when it is blank or unparsable. */
function numericColumn(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Deterministic order, in place, **type first** (issue #2921; the order the
 * retired Firestore chunks were sliced from, which let a reader fetch only one
 * item's chunks).
 *
 * Within a type, contract then the remaining fields. `byContractThenType`
 * alone is not a total order here the way it effectively was on the
 * blueprint-only rows: one contract routinely lists the same type twice — two
 * stacks of the same ore, two copies of one blueprint at different ME — and a
 * tie there falls back to the CSV's incidental row order, which is what the
 * sort exists to defeat. Tie-breaking down to the last distinguishing field
 * means the only rows left in an unspecified order are ones that serialize
 * identically.
 */
export function sortContractOfferRows(rows: PublicContractOfferRow[]): PublicContractOfferRow[] {
  return rows.sort(
    (a, b) =>
      a.typeId - b.typeId ||
      byContractThenType(a, b) ||
      a.quantity - b.quantity ||
      (a.me ?? -1) - (b.me ?? -1) ||
      (a.te ?? -1) - (b.te ?? -1) ||
      (a.runs ?? -1) - (b.runs ?? -1)
  );
}

/**
 * What the R2 offer index says about one item type's offers (issue #2921):
 * `[count, cheapest]` — how many offers, and the lowest positive ask among
 * offers that don't want PLEX in return (`null` when none qualifies).
 */
export type ContractOfferIndexEntry = [count: number, cheapest: number | null];

/**
 * Per listed type, how many offers and the cheapest ask, and every region with
 * an offer: what lets a client suggest item names and fill the region list
 * before reading any type's rows. `contractOfferObjects.ts` adds the object
 * names for R2. Independent of row order.
 */
export interface ContractOfferIndex {
  types: Record<string, ContractOfferIndexEntry>;
  regionIds: number[];
}

export function buildContractOfferIndex(
  rows: readonly PublicContractOfferRow[]
): ContractOfferIndex {
  const types: Record<string, ContractOfferIndexEntry> = {};
  const regions = new Set<number>();
  for (const row of rows) {
    regions.add(row.regionId);
    const entry = (types[String(row.typeId)] ??= [0, null]);
    entry[0] += 1;
    // The same ISK figure the client prices a row at: an auction's buyout when
    // it has one, else its starting bid, so a suggestion's "from" price matches
    // the price the row shows once read.
    const ask = row.isAuction && row.buyout != null && row.buyout > 0 ? row.buyout : row.price;
    if (ask > 0 && !row.requestedPlex && (entry[1] === null || ask < entry[1])) {
      entry[1] = ask;
    }
  }
  return { types, regionIds: [...regions].sort((a, b) => a - b) };
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
  applyRequestedSide(rows, requestedSideByContract(items, eligibleContracts));
  applyLineCounts(rows);

  return sortContractOfferRows(rows);
}

const COURIER_CONTRACT_TYPE = 'courier';

/**
 * Whether this record is a courier contract still outstanding at `nowMs`: the
 * gate `courierContractFrom` applies before it reads any other column, and the
 * denominator the sync logs its kept-row count against. One definition rather
 * than the same test restated at that call site, so widening either half
 * cannot silently desync the two.
 *
 * Matched on `courier` by equality rather than as the complement of
 * `SEARCHABLE_CONTRACT_TYPES`: ESI's `type` enum is
 * `unknown | item_exchange | auction | courier | loan`, and neither `loan` nor
 * `unknown` is a haul to take, so the complement would have published both as
 * courier rows.
 *
 * Expiry is checked here for the same reason `eligibleContractFrom` checks it:
 * EVE Ref's scrape is up to ~30 minutes stale, so an "outstanding" row in the
 * CSV is not a guarantee it still is one.
 */
export function isOutstandingCourierContract(contract: ContractRecord, nowMs: number): boolean {
  if (contract.type !== COURIER_CONTRACT_TYPE) return false;
  const dateExpired = Date.parse(contract.date_expired);
  return Number.isFinite(dateExpired) && dateExpired > nowMs;
}

/**
 * One public courier contract: a haul rather than a purchase (issue #909).
 *
 * A courier contract has no `contract_items.csv` rows — nothing is being sold
 * — so this shape comes straight off the contract record with no join, one row
 * per contract, and it shares none of `PublicContractOfferRow`'s fields beyond
 * identity. That is why it is its own snapshot rather than more rows in the
 * offers collection: every reader of that one filters and sorts by `typeId`,
 * `price` and `quantity`, none of which a courier row has.
 *
 * The four facts that define the job — both endpoints, what it pays, and how
 * much there is to move — are required, and a row whose column for any of them
 * is *blank* is dropped rather than converted: `Number('')` is 0 rather than
 * NaN, so an absent `end_location_id` would publish a delivery to station 0
 * and an absent `reward` a free haul, neither distinguishable from a stated
 * one. A stated `0` is kept — that is a different fact, since a favour run
 * really does pay nothing.
 *
 * In practice that drop should never fire: ESI documents `end_location_id`,
 * `reward` and `collateral` as "for Couriers contract" and populates them on
 * exactly these contracts, which is why the pre-#909 courier fixture — a
 * retyped item_exchange row — has `end_location_id` blank. But none of those
 * columns is in ESI's `required` set, so the rule is a guard against a schema
 * change rather than an expected filter, and the sync logs outstanding courier
 * contracts beside kept rows so that a guard which starts firing shows up
 * instead of quietly publishing an empty snapshot.
 *
 * `collateral` and `daysToComplete` are carried only when stated — the same
 * omit-don't-zero rule the offers rows apply to ME/TE/runs — rather than being
 * required, since a contract stating neither is still a haul.
 */
export interface PublicCourierContractRow {
  contractId: number;
  regionId: number;
  /** Where the haul is picked up (`start_location_id`). */
  originLocationId: number;
  /** Where it has to be delivered (`end_location_id`). */
  destinationLocationId: number;
  /** ISK paid on delivery. */
  reward: number;
  /** m³ of packaged cargo. */
  volume: number;
  /** ISK the hauler puts up, when the contract asks for any. */
  collateral?: number;
  /** Deadline once accepted, in days, when the contract states one. */
  daysToComplete?: number;
  /** Epoch ms. */
  dateExpired: number;
}

/**
 * Narrows one `contracts.csv` record to a `PublicCourierContractRow`, or null
 * when it is not an outstanding, complete courier contract:
 * `isOutstandingCourierContract` decides the first half, the required columns
 * documented on the row shape the second.
 */
export function courierContractFrom(
  contract: ContractRecord,
  nowMs: number
): PublicCourierContractRow | null {
  if (!isOutstandingCourierContract(contract, nowMs)) return null;

  const dateExpired = Date.parse(contract.date_expired);
  const originLocationId = numericColumn(contract.start_location_id);
  const destinationLocationId = numericColumn(contract.end_location_id);
  const reward = numericColumn(contract.reward);
  const volume = numericColumn(contract.volume);
  if (
    originLocationId === undefined ||
    destinationLocationId === undefined ||
    reward === undefined ||
    volume === undefined
  ) {
    return null;
  }

  const collateral = numericColumn(contract.collateral);
  const daysToComplete = numericColumn(contract.days_to_complete);

  return {
    contractId: Number(contract.contract_id),
    regionId: Number(contract.region_id),
    originLocationId,
    destinationLocationId,
    reward,
    volume,
    ...(collateral === undefined ? {} : { collateral }),
    ...(daysToComplete === undefined ? {} : { daysToComplete }),
    dateExpired,
  };
}

/**
 * Deterministic order, in place. One row per contract, so `contractId` alone
 * is a total order here — unlike the offers rows, where one contract lists
 * many item lines and the tie-break has to run down to the last
 * distinguishing field.
 */
export function sortCourierContractRows(
  rows: PublicCourierContractRow[]
): PublicCourierContractRow[] {
  return rows.sort((a, b) => a.contractId - b.contractId);
}

/**
 * Every courier row in one call, over already-parsed records. No item
 * argument, because there are no item lines to join. As with
 * `filterAndCompactPublicContractOffers`, the scheduled sync drives the
 * per-row seam directly rather than calling this — it never holds a record
 * array — so this stays the composed, fixture-testable statement of that pass.
 */
export function filterAndCompactPublicCourierContracts(
  contracts: readonly ContractRecord[],
  nowMs: number
): PublicCourierContractRow[] {
  const rows: PublicCourierContractRow[] = [];
  for (const contract of contracts) {
    const row = courierContractFrom(contract, nowMs);
    if (row) rows.push(row);
  }
  return sortCourierContractRows(rows);
}
