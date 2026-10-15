/**
 * Marks a Member's Pledge deliveries from their own ESI contracts (issue
 * #3809, ADR 0021). Reads the Member's contracts (conditional, cached), keeps
 * only their finished item-exchange contracts to a requester they have an open
 * Pledge with, fetches those contracts' items (cached for good: an issued
 * contract's items never change), runs the pure matcher in
 * `engine/communities/delivery.ts` and writes `delivered` and `contractIds`
 * back through `updateMyPledge`, in batches the rules accept.
 *
 * What reaches Firestore: the Request, the line, a quantity and contract ids.
 * Never a price, the issuer or any other contract content.
 */
import { db as localDb } from '@/db';
import type { ContractItem } from '@/esi/endpoints';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import {
  batchLines,
  contractCompletedAt,
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
import { loadContractItems } from '@/features/character/contractItems';
import { characterIdForUid, uidForCharacter } from '@/sync/uid';
import { communityBackendOverride } from './backendOverride';
import { loadCommunityPledges, loadRequests, updateMyPledge } from './requestStore';

/** The Permission delivery marking needs. */
export const DELIVERY_ENDPOINTS: readonly EsiEndpointId[] = [
  'getCharacterContracts',
  'getCharacterContractItems',
];

/** Item reads one run may add; the rest wait for the next run (they are cached once read). */
export const MAX_ITEM_READS_PER_RUN = 40;

export type DeliverySyncStatus =
  /** Read and written as far as needed. */
  | 'ok'
  /** The Character has not granted the contracts Permission (not an error). */
  | 'needs-scope'
  /** Contracts or their items could not be read: deliveries may be missing. */
  | 'read-failed'
  /** A marked delivery could not be saved. */
  | 'write-failed';

export interface DeliverySyncResult {
  status: DeliverySyncStatus;
  /** Lines whose stored delivery changed. */
  updated: number;
  /** BPC attributes that differ from the ask, by `<requestId>#<line index>`. */
  flags: ReadonlyMap<string, readonly DeliveryFlag[]>;
}

/** The one constructor and parser of a slot's key: `<requestId>#<line index>`. */
export const slotKey = (requestId: string, index: number) => `${requestId}#${index}`;

/** The matcher's view of one ESI contract item; null when the issuer does not hand it over. */
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
  const held = new Set((await localDb.tokens.get(characterId))?.scopes ?? []);
  return requiredScopesForEndpoints(DELIVERY_ENDPOINTS).every((scope) => held.has(scope));
}

interface Planned {
  request: CommunityRequest;
  pledge: RequestPledge;
}

/** This Member's Pledges on open Requests of others: what delivery could change. */
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

/** One slot per Pledged line, each tied to its Request's requester. */
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

/**
 * Contract ids whose items could not be read, by failures this session. A
 * contract that failed twice is skipped, so a few bad ones cannot use up every
 * run's read cap.
 */
const itemReadFailures = new Map<number, number>();
const GIVE_UP_AFTER = 2;

/** The eligible contracts with their items. Stops at the first failed read (rate limit, offline). */
async function readContracts(
  characterId: number,
  slots: readonly DeliverySlot[]
): Promise<
  | { status: 'needs-scope' | 'read-failed' }
  | { status: 'ok'; contracts: DeliveryContract[]; degraded: boolean }
> {
  const contractsRead = await loadContracts(characterId);
  if (contractsRead.needsReauth) return { status: 'needs-scope' };
  if (!contractsRead.cached) return { status: 'read-failed' };
  let degraded = contractsRead.cached.truncated;

  const requesters = new Set(slots.map((slot) => slot.requesterId));
  const since = Math.min(...slots.map((slot) => slot.since));
  const eligible = eligibleContracts(contractsRead.cached.data, characterId, requesters, since);
  const contracts: DeliveryContract[] = [];
  let reads = 0;
  for (const contract of eligible) {
    if ((itemReadFailures.get(contract.contract_id) ?? 0) >= GIVE_UP_AFTER) {
      degraded = true;
      continue;
    }
    if (reads >= MAX_ITEM_READS_PER_RUN) {
      degraded = true;
      break;
    }
    reads += 1;
    const items = await loadContractItems(characterId, contract.contract_id).catch(() => null);
    if (!items) {
      itemReadFailures.set(
        contract.contract_id,
        (itemReadFailures.get(contract.contract_id) ?? 0) + 1
      );
      degraded = true;
      // The first failure may be the error limit or a rate limit: do not press on.
      break;
    }
    contracts.push({
      contractId: contract.contract_id,
      completedAt: contractCompletedAt(contract),
      recipients: [contract.assignee_id, contract.acceptor_id],
      items: items.data.map(toDeliveryItem).filter((item): item is DeliveryItem => item !== null),
    });
  }
  return { status: 'ok', contracts, degraded };
}

/** Whether the Request is now closed or expired, read fresh; false when that cannot be told. */
async function requestIsClosed(
  characterId: number,
  communityId: string,
  requestId: string,
  now: number
): Promise<boolean> {
  try {
    const request = (await loadRequests(characterId, communityId)).find((r) => r.id === requestId);
    return request === undefined || !isOpenRequest(request, now);
  } catch {
    return false;
  }
}

/** Writes changed lines per Request in batches the rules accept. Returns lines updated and whether a save failed. */
async function writeDeliveries(
  characterId: number,
  communityId: string,
  planned: readonly Planned[],
  result: ReadonlyMap<string, SlotDelivery>,
  now: number
): Promise<{ updated: number; writeFailed: boolean }> {
  let updated = 0;
  let writeFailed = false;
  for (const { request, pledge } of planned) {
    const changed: { index: number; entry: PledgeEntry; auto: number }[] = [];
    for (const [i, entry] of Object.entries(pledge.lines)) {
      const index = Number(i);
      const next = result.get(slotKey(request.id, index));
      if (!next) continue;
      const same =
        next.delivered === entry.delivered &&
        next.contractIds.join(',') === (entry.contractIds ?? []).join(',');
      if (!same) {
        changed.push({
          index,
          entry: { ...entry, delivered: next.delivered, contractIds: next.contractIds },
          auto: next.auto,
        });
      }
    }
    for (const batch of batchLines(changed)) {
      try {
        await updateMyPledge(characterId, communityId, request.id, (lines) => {
          const out = { ...lines };
          for (const { index, entry, auto } of batch) {
            const stored = out[index];
            // Withdrawn meanwhile: nothing to mark.
            if (!stored) continue;
            // The amount typed since this run read the Pledge (or while it ran)
            // is in the stored entry, not in `entry`: it must survive, and a
            // typed amount cleared meanwhile must not come back.
            out[index] = {
              ...stored,
              delivered: Math.min(Math.max(auto, stored.manual ?? 0), stored.quantity),
              contractIds: [...(entry.contractIds ?? [])],
            };
          }
          return out;
        });
        updated += batch.length;
      } catch (err) {
        // Only a Request that really closed or expired meanwhile is quiet: a
        // denial for any other reason (session, rules) is a failed save.
        const denied = (err as { code?: string } | null)?.code === 'permission-denied';
        if (!(denied && (await requestIsClosed(characterId, communityId, request.id, now)))) {
          console.warn('Request delivery: could not save a Pledge', err);
          writeFailed = true;
        }
        break;
      }
    }
  }
  return { updated, writeFailed };
}

const running = new Map<string, Promise<DeliverySyncResult>>();

/**
 * One run for one Character in one Community. Concurrent calls for the same
 * pair (the background sweep and a panel opening) share one run. Never throws.
 */
export function syncRequestDeliveries(
  characterId: number,
  communityId: string,
  now: number = Date.now()
): Promise<DeliverySyncResult> {
  const key = `${characterId}:${communityId}`;
  const existing = running.get(key);
  if (existing) return existing;
  const run = doSync(characterId, communityId, now)
    .catch((err): DeliverySyncResult => {
      console.warn('Request delivery: could not read', err);
      return { status: 'read-failed', updated: 0, flags: new Map() };
    })
    .finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

async function doSync(
  characterId: number,
  communityId: string,
  now: number
): Promise<DeliverySyncResult> {
  const none = new Map<string, readonly DeliveryFlag[]>();
  const override = communityBackendOverride();
  if (override?.syncDeliveries) return override.syncDeliveries(communityId);
  if (!(await hasDeliveryScope(characterId))) {
    return { status: 'needs-scope', updated: 0, flags: none };
  }

  const [requests, pledges] = await Promise.all([
    loadRequests(characterId, communityId),
    loadCommunityPledges(characterId, communityId),
  ]);
  const planned = myOpenPledges(requests, pledges, uidForCharacter(characterId), now);
  const slots = buildSlots(planned);
  if (slots.length === 0) return { status: 'ok', updated: 0, flags: none };

  const read = await readContracts(characterId, slots);
  if (read.status !== 'ok') return { status: read.status, updated: 0, flags: none };

  const result = matchDeliveries(slots, read.contracts);
  const flags = new Map<string, readonly DeliveryFlag[]>();
  for (const [key, value] of result) if (value.flags.length > 0) flags.set(key, value.flags);

  const { updated, writeFailed } = await writeDeliveries(
    characterId,
    communityId,
    planned,
    result,
    now
  );
  return {
    status: writeFailed ? 'write-failed' : read.degraded ? 'read-failed' : 'ok',
    updated,
    flags,
  };
}
