import type { ContractItem } from '@/esi/endpoints';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import {
  MAX_CONTRACT_IDS_PER_LINE,
  batchLines,
  contractCompletedAt,
  contractNeedsItems,
  eligibleContracts,
  matchDeliveries,
  previousFromEntry,
  slotOrder,
  type DeliveryContract,
  type DeliveryFlag,
  type DeliveryItem,
  type DeliverySlot,
  type SlotDelivery,
} from '@/engine/communities/delivery';
import {
  isOpenRequest,
  type CommunityRequest,
  type PledgeEntry,
  type RequestPledge,
} from '@/engine/communities/requests';
import { loadContracts } from '@/features/character/contracts';
import { loadContractItemsDetailed } from '@/features/character/contractItems';
import { characterIdForUid, uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { pledgeEditVersion } from './pledgeWrites';
import { loadMyPledges, loadRequestsById, updateMyPledge } from './requestStore';
import { MINUTE_MS } from '@/lib/age';
import { loadGrantedScopes } from '@/app/grantedScopes';

export const DELIVERY_ENDPOINTS: readonly EsiEndpointId[] = [
  'getCharacterContracts',
  'getCharacterContractItems',
];

export const MAX_ITEM_READS_PER_RUN = 40;

export type DeliverySyncStatus = 'ok' | 'needs-scope' | 'read-failed' | 'write-failed';

export interface DeliverySyncResult {
  status: DeliverySyncStatus;
  updated: number;
  flags: ReadonlyMap<string, readonly DeliveryFlag[]>;
}

export const slotKey = (requestId: string, index: number) => `${requestId}#${index}`;

export function toDeliveryItem(item: ContractItem): DeliveryItem | null {
  if (!item.is_included) return null;
  const blueprint =
    item.raw_quantity === -2 || item.runs !== undefined
      ? 'copy'
      : item.raw_quantity === -1
        ? 'original'
        : null;
  return {
    typeId: item.type_id,
    quantity: item.quantity,
    blueprint,
    ...(item.runs !== undefined ? { runs: item.runs } : {}),
  };
}

export async function hasDeliveryScope(characterId: number): Promise<boolean> {
  const held = await loadGrantedScopes(characterId);
  return requiredScopesForEndpoints(DELIVERY_ENDPOINTS).every((scope) => held.has(scope));
}

interface Planned {
  request: CommunityRequest;
  pledge: RequestPledge;
}

function myOpenPledges(
  requests: readonly CommunityRequest[],
  pledges: ReadonlyMap<string, readonly RequestPledge[]>,
  uid: string,
  now: number
): Planned[] {
  const out: Planned[] = [];
  for (const request of requests) {
    if (request.ownerUid === uid || !isOpenRequest(request, now)) continue;
    const pledge = (pledges.get(request.id) ?? []).find((p) => p.uid === uid);
    if (pledge && Object.keys(pledge.lines).length > 0) out.push({ request, pledge });
  }
  return out;
}

function buildSlots(planned: readonly Planned[]): DeliverySlot[] {
  const slots: DeliverySlot[] = [];
  for (const { request, pledge } of planned) {
    const requesterId = characterIdForUid(request.ownerUid);
    if (requesterId === null) continue;
    for (const [i, entry] of Object.entries(pledge.lines)) {
      const index = Number(i);
      const line = request.lines[index];
      if (!line) continue;
      slots.push({
        key: slotKey(request.id, index),
        line,
        requesterId,
        quantity: entry.quantity,
        since: request.createdAt,
        order: slotOrder(request.createdAt, index),
        ...previousFromEntry(entry),
      });
    }
  }
  return slots;
}

const itemReadFailures = new Map<number, { count: number; first: number }>();
const GIVE_UP_AFTER = 2;
export const GIVE_UP_SPAN_MS = 5 * MINUTE_MS;

const isDefiniteNo = (status: number | undefined) => status === 404;

const givenUp = (contractId: number, now: number) => {
  const failure = itemReadFailures.get(contractId);
  return (
    failure !== undefined &&
    failure.count >= GIVE_UP_AFTER &&
    now - failure.first >= GIVE_UP_SPAN_MS
  );
};

async function readContracts(
  characterId: number,
  slots: readonly DeliverySlot[],
  now: number
): Promise<
  | { status: 'needs-scope' | 'read-failed' }
  | { status: 'ok'; contracts: DeliveryContract[]; degraded: boolean; horizon: number }
> {
  const contractsRead = await loadContracts(characterId);
  if (contractsRead.needsReauth) return { status: 'needs-scope' };
  if (!contractsRead.cached) return { status: 'read-failed' };
  let degraded = contractsRead.cached.truncated;

  const requesters = new Set(slots.map((slot) => slot.requesterId));
  const since = Math.min(...slots.map((slot) => slot.since));
  const eligible = eligibleContracts(
    contractsRead.cached.data,
    characterId,
    requesters,
    since
  ).sort(
    (a, b) => contractCompletedAt(a) - contractCompletedAt(b) || a.contract_id - b.contract_id
  );
  const contracts: DeliveryContract[] = [];
  let reads = 0;
  let horizon = Infinity;
  const hold = (contract: (typeof eligible)[number]) => {
    horizon = Math.min(horizon, contractCompletedAt(contract));
  };
  for (const [position, contract] of eligible.entries()) {
    const header = {
      contractId: contract.contract_id,
      completedAt: contractCompletedAt(contract),
      recipients: [contract.assignee_id, contract.acceptor_id],
    };
    if (!contractNeedsItems(slots, header)) continue;
    if (givenUp(contract.contract_id, now)) {
      degraded = true;
      continue;
    }
    if (reads >= MAX_ITEM_READS_PER_RUN) {
      degraded = true;
      for (const rest of eligible.slice(position)) {
        const restHeader = {
          contractId: rest.contract_id,
          completedAt: contractCompletedAt(rest),
          recipients: [rest.assignee_id, rest.acceptor_id],
        };
        if (contractNeedsItems(slots, restHeader) && !givenUp(rest.contract_id, now)) hold(rest);
      }
      break;
    }
    const outcome = await loadContractItemsDetailed(characterId, contract.contract_id).catch(
      () => ({ result: null, networkRead: true, failureStatus: 0 })
    );
    if (outcome.networkRead) reads += 1;
    if (!outcome.result) {
      if (outcome.failureStatus === 403) return { status: 'needs-scope' };
      degraded = true;
      hold(contract);
      if (isDefiniteNo(outcome.failureStatus)) {
        const before = itemReadFailures.get(contract.contract_id);
        itemReadFailures.set(contract.contract_id, {
          count: (before?.count ?? 0) + 1,
          first: before?.first ?? now,
        });
        continue;
      }
      for (const rest of eligible.slice(position + 1)) {
        const restHeader = {
          contractId: rest.contract_id,
          completedAt: contractCompletedAt(rest),
          recipients: [rest.assignee_id, rest.acceptor_id],
        };
        if (contractNeedsItems(slots, restHeader) && !givenUp(rest.contract_id, now)) hold(rest);
      }
      break;
    }
    itemReadFailures.delete(contract.contract_id);
    contracts.push({
      ...header,
      items: outcome.result.data
        .map(toDeliveryItem)
        .filter((item): item is DeliveryItem => item !== null),
    });
  }
  return { status: 'ok', contracts, degraded, horizon };
}

async function requestIsClosed(
  characterId: number,
  communityId: string,
  requestId: string,
  now: number
): Promise<boolean | 'unknown'> {
  try {
    const [request] = await loadRequestsById(characterId, communityId, [requestId]);
    return request === undefined || !isOpenRequest(request, now);
  } catch (err) {
    console.warn('Request delivery: could not tell whether the Request closed', err);
    return 'unknown';
  }
}

const hasHistory = (entry: PledgeEntry) =>
  (entry.auto ?? 0) > 0 || (entry.contractIds?.length ?? 0) > 0;

async function writeDeliveries(
  characterId: number,
  communityId: string,
  planned: readonly Planned[],
  result: ReadonlyMap<string, SlotDelivery>,
  now: number,
  startVersion: number
): Promise<{ updated: number; writeFailed: boolean }> {
  let updated = 0;
  let writeFailed = false;
  for (const { request, pledge } of planned) {
    const changed: {
      index: number;
      entry: PledgeEntry;
      before: PledgeEntry;
      next: SlotDelivery;
    }[] = [];
    for (const [i, before] of Object.entries(pledge.lines)) {
      const index = Number(i);
      const next = result.get(slotKey(request.id, index));
      if (!next) continue;
      const same =
        next.delivered === before.delivered &&
        next.auto === (before.auto ?? 0) &&
        next.through === (before.through ?? 0) &&
        next.contractIds.join(',') === (before.contractIds ?? []).join(',');
      if (!same) {
        changed.push({
          index,
          before,
          next,
          entry: {
            ...before,
            delivered: next.delivered,
            auto: next.auto,
            through: next.through,
            contractIds: next.contractIds,
          },
        });
      }
    }
    for (const batch of batchLines(changed)) {
      if (pledgeEditVersion(characterId, communityId) !== startVersion)
        return { updated, writeFailed };
      try {
        await updateMyPledge(characterId, communityId, request.id, (lines) => {
          const out = { ...lines };
          for (const { index, before, next } of batch) {
            const stored = out[index];
            if (!stored) continue;
            if (hasHistory(before) && !hasHistory(stored)) continue;
            const auto = Math.max(next.auto, stored.auto ?? 0);
            const ids = [...new Set([...(stored.contractIds ?? []), ...next.contractIds])].slice(
              -MAX_CONTRACT_IDS_PER_LINE
            );
            out[index] = {
              ...stored,
              delivered: Math.min(Math.max(auto, stored.manual ?? 0), stored.quantity),
              auto,
              through: Math.max(next.through, stored.through ?? 0),
              contractIds: ids,
            };
          }
          return out;
        });
        updated += batch.length;
      } catch (err) {
        const denied = (err as { code?: string } | null)?.code === 'permission-denied';
        if (!(
          denied && (await requestIsClosed(characterId, communityId, request.id, now)) === true
        )) {
          console.warn('Request delivery: could not save a Pledge', err);
          writeFailed = true;
        }
        break;
      }
    }
  }
  return { updated, writeFailed };
}

const running = new Map<string, { run: Promise<DeliverySyncResult>; version: number }>();

export function syncRequestDeliveries(
  characterId: number,
  communityId: string,
  now: number = Date.now()
): Promise<DeliverySyncResult> {
  const key = `${characterId}:${communityId}`;
  const version = pledgeEditVersion(characterId, communityId);
  const existing = running.get(key);
  if (existing && existing.version === version) return existing.run;
  const run: Promise<DeliverySyncResult> = doSync(characterId, communityId, now, version)
    .catch((err): DeliverySyncResult => {
      console.warn('Request delivery: could not read', err);
      return { status: 'read-failed', updated: 0, flags: new Map() };
    })
    .finally(() => {
      if (running.get(key)?.run === run) running.delete(key);
    });
  running.set(key, { run, version });
  return run;
}

async function doSync(
  characterId: number,
  communityId: string,
  now: number,
  startVersion: number
): Promise<DeliverySyncResult> {
  const none = new Map<string, readonly DeliveryFlag[]>();
  const override = communityBackendOverride();
  if (override?.syncDeliveries) return override.syncDeliveries(communityId);
  if (!(await hasDeliveryScope(characterId))) {
    return { status: 'needs-scope', updated: 0, flags: none };
  }

  const mine = await loadMyPledges(characterId, communityId);
  if (mine.size === 0) return { status: 'ok', updated: 0, flags: none };
  const requests = await loadRequestsById(characterId, communityId, [...mine.keys()]);
  const pledges = new Map([...mine].map(([requestId, pledge]) => [requestId, [pledge]]));
  const planned = myOpenPledges(requests, pledges, uidForCharacter(characterId), now);
  const slots = buildSlots(planned);
  if (slots.length === 0) return { status: 'ok', updated: 0, flags: none };

  const read = await readContracts(characterId, slots, now);
  if (read.status !== 'ok') return { status: read.status, updated: 0, flags: none };

  const result = matchDeliveries(slots, read.contracts, { horizon: read.horizon });
  const flags = new Map<string, readonly DeliveryFlag[]>();
  for (const [key, value] of result) if (value.flags.length > 0) flags.set(key, value.flags);

  const { updated, writeFailed } = await writeDeliveries(
    characterId,
    communityId,
    planned,
    result,
    now,
    startVersion
  );
  return {
    status: writeFailed ? 'write-failed' : read.degraded ? 'read-failed' : 'ok',
    updated,
    flags,
  };
}
