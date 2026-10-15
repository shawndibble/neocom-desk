/**
 * Delivery marking for Community Requests (issue #3809, ADR 0021): a Member's
 * own finished item-exchange contracts to the requester are matched against
 * their Pledge lines. Pure: the caller reads ESI and writes Firestore.
 *
 * Idempotent by construction. `delivered` is recomputed from the whole set of
 * matching contracts on every run, never incremented, so running twice (or on
 * two devices) gives one answer. Because ESI only keeps recent contracts, what
 * an earlier run recorded is carried as a base (`previousAuto`), and only
 * contracts that run had not already counted are added on top of it.
 *
 * Only the Request, the line, a quantity and contract ids ever leave this
 * module's result for Firestore: no prices, no issuer, no other contents.
 */
import type { PledgeEntry, RequestLine } from './requests';

/** Mirrors the rules' cap on `contractIds` a line. */
export const MAX_CONTRACT_IDS_PER_LINE = 20;
/** A Pledge write may change at most this many lines (the rules' expression budget). */
export const MAX_LINES_PER_PLEDGE_WRITE = 4;

export interface DeliveryItem {
  typeId: number;
  quantity: number;
  /** Null for anything that is not a blueprint. */
  blueprint: 'copy' | 'original' | null;
  runs?: number;
}

export interface DeliveryContract {
  contractId: number;
  /** When it finished, ms since epoch. */
  completedAt: number;
  /** Who the contract went to (its assignee and acceptor Character ids). */
  recipients: readonly number[];
  items: readonly DeliveryItem[];
}

/** One Pledge line the Member could deliver on. */
export interface DeliverySlot {
  /** Caller's identity for the slot, e.g. `<requestId>#<index>`. */
  key: string;
  line: RequestLine;
  /** The requester's Character id: only a contract to them counts toward this slot. */
  requesterId: number;
  /** The Pledged quantity: delivery never counts above it. */
  quantity: number;
  /** A contract finished before this (the Request's creation) is not a delivery to it. */
  since: number;
  /** Pledges are served oldest first: see `slotOrder`. */
  order: SlotOrder;
  /** What an earlier run recorded from contracts. */
  previousAuto: number;
  previousContractIds: readonly number[];
  /** An amount the Member typed. */
  manual?: number;
}

/** Oldest Request first, then the lower line index. */
export type SlotOrder = readonly [requestCreatedAt: number, lineIndex: number];

export const slotOrder = (requestCreatedAt: number, lineIndex: number): SlotOrder => [
  requestCreatedAt,
  lineIndex,
];

const byOrder = (a: SlotOrder, b: SlotOrder) => a[0] - b[0] || a[1] - b[1];

export interface DeliveryFlag {
  contractId: number;
  /** Only runs: ESI's personal contract items carry no ME or TE. */
  attribute: 'runs';
  asked: number;
  got: number;
}

export interface SlotDelivery {
  delivered: number;
  contractIds: number[];
  flags: DeliveryFlag[];
}

function accepts(slot: DeliverySlot, contract: DeliveryContract, item: DeliveryItem): boolean {
  const line = slot.line;
  if (!contract.recipients.includes(slot.requesterId)) return false;
  if (item.typeId !== line.typeId) return false;
  if (line.kind === 'bpc') return item.blueprint === 'copy';
  if (line.kind === 'bpo') return item.blueprint === 'original';
  return true;
}

/**
 * Whether a contract id is one a stored entry already counts. The recorded
 * list keeps only the highest ids, so at the cap a lower id was trimmed, not new.
 */
function recordedTest(ids: readonly number[]): (id: number) => boolean {
  const set = new Set(ids);
  const floor = ids.length >= MAX_CONTRACT_IDS_PER_LINE ? Math.min(...ids) : -Infinity;
  return (id) => set.has(id) || id < floor;
}

/** Matches contracts to slots; one entry per slot, in any order. */
export function matchDeliveries(
  slots: readonly DeliverySlot[],
  contracts: readonly DeliveryContract[]
): Map<string, SlotDelivery> {
  const ordered = [...slots].sort((a, b) => byOrder(a.order, b.order));
  const sorted = [...contracts].sort(
    (a, b) => a.completedAt - b.completedAt || a.contractId - b.contractId
  );
  const counted = new Map<string, number>();
  /** Of `counted`, what came from contracts the stored entry already records. */
  const countedRecorded = new Map<string, number>();
  const recorded = new Map<string, (id: number) => boolean>();
  const matched = new Map<string, Set<number>>();
  const flags = new Map<string, DeliveryFlag[]>();
  for (const slot of slots) {
    counted.set(slot.key, 0);
    countedRecorded.set(slot.key, 0);
    recorded.set(slot.key, recordedTest(slot.previousContractIds));
    matched.set(slot.key, new Set());
    flags.set(slot.key, []);
  }

  for (const contract of sorted) {
    for (const item of contract.items) {
      let left = item.quantity;
      for (const slot of ordered) {
        if (left <= 0) break;
        if (contract.completedAt < slot.since || !accepts(slot, contract, item)) continue;
        const room = slot.quantity - (counted.get(slot.key) ?? 0);
        if (room <= 0) continue;
        const take = Math.min(room, left);
        left -= take;
        counted.set(slot.key, (counted.get(slot.key) ?? 0) + take);
        if (recorded.get(slot.key)?.(contract.contractId)) {
          countedRecorded.set(slot.key, (countedRecorded.get(slot.key) ?? 0) + take);
        }
        matched.get(slot.key)?.add(contract.contractId);
        const asked = slot.line.runs;
        const list = flags.get(slot.key) ?? [];
        if (
          slot.line.kind === 'bpc' &&
          asked !== undefined &&
          item.runs !== undefined &&
          asked !== item.runs &&
          !list.some((f) => f.contractId === contract.contractId)
        ) {
          list.push({
            contractId: contract.contractId,
            attribute: 'runs',
            asked,
            got: item.runs,
          });
        }
      }
    }
  }

  const result = new Map<string, SlotDelivery>();
  for (const slot of slots) {
    // What an earlier run recorded from contracts ESI no longer shows is a base;
    // what it recorded from contracts still visible is in `counted` already.
    const aged = Math.max(0, slot.previousAuto - (countedRecorded.get(slot.key) ?? 0));
    const auto = aged + (counted.get(slot.key) ?? 0);
    const ids = [...new Set([...slot.previousContractIds, ...(matched.get(slot.key) ?? [])])]
      .sort((a, b) => a - b)
      .slice(-MAX_CONTRACT_IDS_PER_LINE);
    result.set(slot.key, {
      delivered: Math.min(slot.quantity, Math.max(auto, slot.manual ?? 0)),
      contractIds: ids,
      flags: flags.get(slot.key) ?? [],
    });
  }
  return result;
}

/** What contracts alone account for in a stored entry: `delivered`, unless the typed amount is what shows. */
function autoPart(entry: PledgeEntry): number {
  return entry.manual !== undefined && entry.delivered <= entry.manual ? 0 : entry.delivered;
}

/**
 * The entry after the Member types a delivered amount (0 clears it): the
 * figure shown is the larger of it and what contracts showed, so it is never
 * added to a contract delivery and survives the automatic recompute.
 */
export function pledgeEntryAfterManual(entry: PledgeEntry, amount: number): PledgeEntry {
  const auto = autoPart(entry);
  const rest: PledgeEntry = { quantity: entry.quantity, delivered: entry.delivered };
  if (entry.contractIds) rest.contractIds = entry.contractIds;
  // Clearing leaves `auto`, which is 0 when the typed amount was what showed:
  // the caller re-runs the contract sync so the figure comes back from contracts.
  if (amount <= 0) return { ...rest, delivered: auto };
  const typed = Math.min(amount, entry.quantity);
  return { ...rest, delivered: Math.min(entry.quantity, Math.max(auto, typed)), manual: typed };
}

/** The slot's starting state from a stored entry. */
export function previousFromEntry(entry: PledgeEntry) {
  return {
    previousAuto: autoPart(entry),
    previousContractIds: entry.contractIds ?? [],
    ...(entry.manual !== undefined ? { manual: entry.manual } : {}),
  };
}

/** The subset of an ESI contract this module reads. */
export interface ContractHeader {
  contract_id: number;
  issuer_id: number;
  assignee_id: number;
  acceptor_id: number;
  type: string;
  status: string;
  for_corporation: boolean;
  date_issued: string;
  date_completed?: string;
}

const FINISHED = new Set(['finished', 'finished_issuer', 'finished_contractor']);

export const contractCompletedAt = (c: ContractHeader): number =>
  Date.parse(c.date_completed ?? c.date_issued);

/**
 * The Member's own finished item-exchange contracts to one of the given
 * requesters (Character ids), completed at or after `since`. Everything else
 * is never read, so never has its items fetched.
 */
export function eligibleContracts<C extends ContractHeader>(
  contracts: readonly C[],
  myCharacterId: number,
  requesterIds: ReadonlySet<number>,
  since: number
): C[] {
  return contracts.filter(
    (c) =>
      c.issuer_id === myCharacterId &&
      !c.for_corporation &&
      c.type === 'item_exchange' &&
      FINISHED.has(c.status) &&
      (requesterIds.has(c.assignee_id) || requesterIds.has(c.acceptor_id)) &&
      contractCompletedAt(c) >= since
  );
}

/**
 * The rules' evaluation budget a changed entry costs, measured on the Firestore
 * emulator (rules-tests/communities.rules.test.ts pins it): about 350 for the
 * document, then per changed line ~110 plus ~27 for each contract id and ~35
 * for a typed amount, against a hard limit of 1000. Rounded up.
 */
export function pledgeLineCost(entry: PledgeEntry): number {
  return 110 + 27 * (entry.contractIds?.length ?? 0) + (entry.manual !== undefined ? 35 : 0);
}

/** What one write's changed lines may cost together; a single line always goes alone if over. */
export const PLEDGE_WRITE_BUDGET = 480;

/**
 * Splits changed lines into writes the rules accept: at most
 * `MAX_LINES_PER_PLEDGE_WRITE` lines and within `PLEDGE_WRITE_BUDGET`. A line
 * too heavy for any company goes in a write of its own (a full 20-id line
 * alone is accepted).
 */
export function batchLines<T extends { entry: PledgeEntry }>(changed: readonly T[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let cost = 0;
  for (const item of changed) {
    const c = pledgeLineCost(item.entry);
    if (
      current.length > 0 &&
      (current.length >= MAX_LINES_PER_PLEDGE_WRITE || cost + c > PLEDGE_WRITE_BUDGET)
    ) {
      out.push(current);
      current = [];
      cost = 0;
    }
    current.push(item);
    cost += c;
  }
  if (current.length > 0) out.push(current);
  return out;
}
