import { isFinishedContractStatus } from '../contracts/contractStatus';
import type { PledgeEntry, RequestLine } from './requests';

export const MAX_CONTRACT_IDS_PER_LINE = 10;
export const MAX_LINES_PER_PLEDGE_WRITE = 4;

export interface DeliveryItem {
  typeId: number;
  quantity: number;
  blueprint: 'copy' | 'original' | null;
  runs?: number;
}

export interface DeliveryContract {
  contractId: number;
  completedAt: number;
  recipients: readonly number[];
  items: readonly DeliveryItem[];
}

export interface DeliverySlot {
  key: string;
  line: RequestLine;
  requesterId: number;
  quantity: number;
  since: number;
  order: SlotOrder;
  previousAuto: number;
  previousContractIds: readonly number[];
  previousThrough?: number;
  manual?: number;
}

export type SlotOrder = readonly [requestCreatedAt: number, lineIndex: number];

export const slotOrder = (requestCreatedAt: number, lineIndex: number): SlotOrder => [
  requestCreatedAt,
  lineIndex,
];

const byOrder = (a: SlotOrder, b: SlotOrder) => a[0] - b[0] || a[1] - b[1];

export interface DeliveryFlag {
  contractId: number;
  attribute: 'runs';
  asked: number;
  got: number;
}

export interface SlotDelivery {
  delivered: number;
  auto: number;
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

const alreadyCounted = (
  slot: DeliverySlot,
  contract: Pick<DeliveryContract, 'contractId' | 'completedAt'>
) =>
  slot.previousContractIds.includes(contract.contractId) ||
  (slot.previousThrough !== undefined && contract.completedAt <= slot.previousThrough);

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

export function matchDeliveries(
  slots: readonly DeliverySlot[],
  contracts: readonly DeliveryContract[],
  options: {
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

function autoPart(entry: PledgeEntry): number {
  if (entry.auto !== undefined) return entry.auto;
  return entry.manual !== undefined && entry.delivered <= entry.manual ? 0 : entry.delivered;
}

export function pledgeEntryAfterManual(entry: PledgeEntry, amount: number): PledgeEntry {
  const auto = autoPart(entry);
  const rest: PledgeEntry = { quantity: entry.quantity, delivered: entry.delivered };
  if (entry.auto !== undefined || auto > 0) rest.auto = auto;
  const unknownFigure = entry.auto === undefined && auto === 0;
  if (entry.contractIds) rest.contractIds = amount <= 0 && unknownFigure ? [] : entry.contractIds;
  if (entry.through !== undefined) rest.through = entry.through;
  if (amount <= 0) return { ...rest, delivered: Math.min(entry.quantity, auto) };
  const typed = Math.min(amount, entry.quantity);
  return { ...rest, delivered: Math.min(entry.quantity, Math.max(auto, typed)), manual: typed };
}

export function previousFromEntry(entry: PledgeEntry) {
  const previousAuto = autoPart(entry);
  const idsProve = entry.auto !== undefined || entry.manual === undefined || previousAuto > 0;
  return {
    previousAuto,
    previousContractIds: idsProve ? (entry.contractIds ?? []) : [],
    ...(entry.through !== undefined ? { previousThrough: entry.through } : {}),
    ...(entry.manual !== undefined ? { manual: entry.manual } : {}),
  };
}

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

export function pledgeLineCost(entry: PledgeEntry): number {
  return 130 + 27 * (entry.contractIds?.length ?? 0) + (entry.manual !== undefined ? 35 : 0);
}

export const PLEDGE_WRITE_BUDGET = 520;

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
