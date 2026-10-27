/**
 * Delivery marking for Community Requests (issue #3809, ADR 0021): a Member's
 * own finished item-exchange contracts to the requester are matched against
 * their Pledge lines. Pure: the caller reads ESI and writes Firestore.
 *
 * Idempotent by construction. `delivered` is recomputed from the whole set of
 * matching contracts on every run, never incremented, so running twice (or on
 * two devices) gives one answer. Because ESI only keeps recent contracts, what
 * an earlier run recorded is stored on the entry itself (`auto`, and `through`:
 * the latest finish time counted), so a contract is already counted when its id
 * is recorded or it finished by `through`; only the rest is added on top. The
 * id list is capped evidence, never the source of the figure. A contract
 * counts toward one Pledge: not one another of the Member's Pledges records.
 *
 * Only the Request, the line, a quantity and contract ids ever leave this
 * module's result for Firestore: no prices, no issuer, no other contents.
 */
import { isFinishedContractStatus } from '../contracts/contractStatus';
import type { PledgeEntry, RequestLine } from './requests';

/** Mirrors the rules' cap on `contractIds` a line. */
export const MAX_CONTRACT_IDS_PER_LINE = 10;
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
  /** What an earlier run recorded from contracts, unclamped (a lowered Pledge keeps it). */
  previousAuto: number;
  /** The contracts it recorded: evidence only, capped, in recorded order. */
  previousContractIds: readonly number[];
  /** The latest finish time of any contract counted so far; absent on an entry from before it was stored. */
  previousThrough?: number;
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
  /** What the line shows: the larger of `auto` and a typed amount, within the Pledge. */
  delivered: number;
  /** What contracts alone account for, unclamped: stored as it is, clamped only to show. */
  auto: number;
  /** The latest finish time of any contract counted so far, ms. */
  through: number;
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

/** Counted already: by id, or finished no later than what an earlier run counted through. */
const alreadyCounted = (
  slot: DeliverySlot,
  contract: Pick<DeliveryContract, 'contractId' | 'completedAt'>
) =>
  slot.previousContractIds.includes(contract.contractId) ||
  (slot.previousThrough !== undefined && contract.completedAt <= slot.previousThrough);

/**
 * Whether reading a contract's items could change any slot: some slot for a
 * requester it went to, with room left, that has not already counted it. A
 * contract no slot needs is never read, so it costs no read of the run's cap.
 */
export function contractNeedsItems(
  slots: readonly DeliverySlot[],
  contract: { contractId: number; completedAt: number; recipients: readonly number[] }
): boolean {
  return slots.some(
    (slot) =>
      contract.recipients.includes(slot.requesterId) &&
      contract.completedAt >= slot.since &&
      slot.previousAuto < slot.quantity &&
      !alreadyCounted(slot, contract)
  );
}

/** Matches contracts to slots; one entry per slot, in any order. */
export function matchDeliveries(
  slots: readonly DeliverySlot[],
  contracts: readonly DeliveryContract[],
  options: {
    /**
     * The earliest finish time of a contract that could not be read (a failed
     * or capped item read). Nothing finishing at or after it is counted: an
     * unread contract blocks what came after until it is read or given up, so
     * `through` never passes a contract that was not looked at.
     */
    horizon?: number;
  } = {}
): Map<string, SlotDelivery> {
  const horizon = options.horizon ?? Infinity;
  const ordered = [...slots].sort((a, b) => byOrder(a.order, b.order));
  const sorted = [...contracts].sort(
    (a, b) => a.completedAt - b.completedAt || a.contractId - b.contractId
  );
  const auto = new Map<string, number>();
  const through = new Map<string, number>();
  const matched = new Map<string, number[]>();
  const flags = new Map<string, DeliveryFlag[]>();
  for (const slot of slots) {
    auto.set(slot.key, slot.previousAuto);
    through.set(slot.key, slot.previousThrough ?? 0);
    matched.set(slot.key, []);
    flags.set(slot.key, []);
  }
  for (const contract of sorted) {
    if (contract.completedAt >= horizon) break;
    for (const item of contract.items) {
      let left = item.quantity;
      for (const slot of ordered) {
        if (left <= 0) break;
        if (contract.completedAt < slot.since || !accepts(slot, contract, item)) continue;
        if (alreadyCounted(slot, contract)) continue;
        // A contract counts toward one Pledge: not an item another of this
        // Member's Pledges for the same requester already took, by id or by
        // having counted through its finish time.
        if (
          slots.some(
            (other) =>
              other !== slot &&
              accepts(other, contract, item) &&
              (other.previousContractIds.includes(contract.contractId) ||
                (other.previousThrough !== undefined &&
                  other.previousThrough >= contract.completedAt &&
                  other.since <= contract.completedAt))
          )
        ) {
          continue;
        }
        const room = slot.quantity - (auto.get(slot.key) ?? 0);
        if (room <= 0) continue;
        const take = Math.min(room, left);
        left -= take;
        auto.set(slot.key, (auto.get(slot.key) ?? 0) + take);
        through.set(slot.key, Math.max(through.get(slot.key) ?? 0, contract.completedAt));
        const list = matched.get(slot.key) ?? [];
        if (!list.includes(contract.contractId)) list.push(contract.contractId);
        const asked = slot.line.runs;
        const flagList = flags.get(slot.key) ?? [];
        if (
          slot.line.kind === 'bpc' &&
          asked !== undefined &&
          item.runs !== undefined &&
          asked !== item.runs &&
          !flagList.some((f) => f.contractId === contract.contractId)
        ) {
          flagList.push({
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
    const total = auto.get(slot.key) ?? 0;
    // Recorded order, the newest last; the list is evidence only, `through` carries the rest.
    const ids = [...new Set([...slot.previousContractIds, ...(matched.get(slot.key) ?? [])])].slice(
      -MAX_CONTRACT_IDS_PER_LINE
    );
    result.set(slot.key, {
      delivered: Math.min(slot.quantity, Math.max(total, slot.manual ?? 0)),
      auto: total,
      through: through.get(slot.key) ?? 0,
      contractIds: ids,
      flags: flags.get(slot.key) ?? [],
    });
  }
  return result;
}

/**
 * What contracts alone account for in a stored entry: its `auto`. An entry
 * from before `auto` was stored: `delivered`, unless a typed amount is what shows.
 */
function autoPart(entry: PledgeEntry): number {
  if (entry.auto !== undefined) return entry.auto;
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
  // A legacy entry whose contract figure is unknown (0) stays without `auto`: see `previousFromEntry`.
  if (entry.auto !== undefined || auto > 0) rest.auto = auto;
  const unknownFigure = entry.auto === undefined && auto === 0;
  // Their ids prove nothing for such an entry (see `previousFromEntry`): the visible contracts count again.
  if (entry.contractIds) rest.contractIds = amount <= 0 && unknownFigure ? [] : entry.contractIds;
  if (entry.through !== undefined) rest.through = entry.through;
  // Clearing shows what contracts account for; the caller re-runs the contract sync.
  if (amount <= 0) return { ...rest, delivered: Math.min(entry.quantity, auto) };
  const typed = Math.min(amount, entry.quantity);
  return { ...rest, delivered: Math.min(entry.quantity, Math.max(auto, typed)), manual: typed };
}

/** The slot's starting state from a stored entry. */
export function previousFromEntry(entry: PledgeEntry) {
  const previousAuto = autoPart(entry);
  // An entry from before `auto` was stored, showing a typed amount: its contract
  // figure is unknown (0), so its ids prove nothing and the visible contracts count again.
  const idsProve = entry.auto !== undefined || entry.manual === undefined || previousAuto > 0;
  return {
    previousAuto,
    previousContractIds: idsProve ? (entry.contractIds ?? []) : [],
    ...(entry.through !== undefined ? { previousThrough: entry.through } : {}),
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
      isFinishedContractStatus(c.status) &&
      (requesterIds.has(c.assignee_id) || requesterIds.has(c.acceptor_id)) &&
      contractCompletedAt(c) >= since
  );
}

/**
 * The rules' evaluation budget a changed entry costs, measured on the Firestore
 * emulator (rules-tests/communities.rules.test.ts pins it): about 350 for the
 * document, then per changed line ~130 (with `auto` and `through`) plus ~27
 * for each contract id and ~35 for a typed amount, against a hard limit of
 * 1000. Rounded up.
 */
export function pledgeLineCost(entry: PledgeEntry): number {
  return 130 + 27 * (entry.contractIds?.length ?? 0) + (entry.manual !== undefined ? 35 : 0);
}

/** What one write's changed lines may cost together; a single line always goes alone if over. */
export const PLEDGE_WRITE_BUDGET = 520;

/**
 * Splits changed lines into writes the rules accept: at most
 * `MAX_LINES_PER_PLEDGE_WRITE` lines and within `PLEDGE_WRITE_BUDGET`. A line
 * too heavy for any company goes in a write of its own (a full 10-id line
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
