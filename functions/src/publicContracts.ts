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

const SEARCHABLE_CONTRACT_TYPES = new Set(['item_exchange', 'auction']);

const PLEX_TYPE_ID = 44992;

export interface EligibleContract {
  contractId: number;
  regionId: number;
  locationId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  dateExpired: number;
}

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

function byContractThenType(
  a: { contractId: number; typeId: number },
  b: { contractId: number; typeId: number }
): number {
  return a.contractId - b.contractId || a.typeId - b.typeId;
}

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
  requestedPlex?: number;
  requestsItems?: true;
  lineCount?: number;
  dateExpired: number;
}

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

export interface RequestedSide {
  plex: Map<string, number>;
  items: Set<string>;
}

export function emptyRequestedSide(): RequestedSide {
  return { plex: new Map(), items: new Set() };
}

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

export function requestedSideByContract(
  items: readonly ContractItemRecord[],
  eligibleContracts: ReadonlyMap<string, EligibleContract>
): RequestedSide {
  const side = emptyRequestedSide();
  for (const item of items) accumulateRequestedSide(item, eligibleContracts, side);
  return side;
}

export function applyRequestedSide(rows: PublicContractOfferRow[], side: RequestedSide): void {
  if (side.plex.size === 0 && side.items.size === 0) return;
  for (const row of rows) {
    const contractId = String(row.contractId);
    const requestedPlex = side.plex.get(contractId);
    if (requestedPlex) row.requestedPlex = requestedPlex;
    if (side.items.has(contractId)) row.requestsItems = true;
  }
}

export function applyLineCounts(rows: PublicContractOfferRow[]): void {
  const linesByContract = new Map<number, number>();
  for (const row of rows) {
    linesByContract.set(row.contractId, (linesByContract.get(row.contractId) ?? 0) + 1);
  }
  for (const row of rows) row.lineCount = linesByContract.get(row.contractId)!;
}

function numericColumn(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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

export type ContractOfferIndexEntry = [count: number, cheapest: number | null];

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
    const ask = row.isAuction && row.buyout != null && row.buyout > 0 ? row.buyout : row.price;
    if (ask > 0 && !row.requestedPlex && (entry[1] === null || ask < entry[1])) {
      entry[1] = ask;
    }
  }
  return { types, regionIds: [...regions].sort((a, b) => a - b) };
}

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

export function isOutstandingCourierContract(contract: ContractRecord, nowMs: number): boolean {
  if (contract.type !== COURIER_CONTRACT_TYPE) return false;
  const dateExpired = Date.parse(contract.date_expired);
  return Number.isFinite(dateExpired) && dateExpired > nowMs;
}

export interface PublicCourierContractRow {
  contractId: number;
  regionId: number;
  originLocationId: number;
  destinationLocationId: number;
  reward: number;
  volume: number;
  collateral?: number;
  daysToComplete?: number;
  dateExpired: number;
}

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

export function sortCourierContractRows(
  rows: PublicCourierContractRow[]
): PublicCourierContractRow[] {
  return rows.sort((a, b) => a.contractId - b.contractId);
}

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
