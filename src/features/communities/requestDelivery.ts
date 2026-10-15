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
  type DeliveryContract,
  type DeliveryFlag,
  type DeliveryItem,
  type DeliverySlot,
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
    ...readEfficiencies(item),
  };
}

/** ME and TE are not on the Character contract-items route today; carried if ESI adds them. */
function readEfficiencies(item: ContractItem): { me?: number; te?: number } {
  const extra = item as ContractItem & { material_efficiency?: number; time_efficiency?: number };
  return {
    ...(extra.material_efficiency !== undefined ? { me: extra.material_efficiency } : {}),
    ...(extra.time_efficiency !== undefined ? { te: extra.time_efficiency } : {}),
  };
}

export async function hasDeliveryScope(characterId: number): Promise<boolean> {
  const held = new Set((await localDb.tokens.get(characterId))?.scopes ?? []);
  return requiredScopesForEndpoints(DELIVERY_ENDPOINTS).every((scope) => held.has(scope));
}

/** A Firestore refusal of the write: the Request closed or expired since it was read. */
const isRefusal = (err: unknown) => (err as { code?: string } | null)?.code === 'permission-denied';

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
    .catch((): DeliverySyncResult => ({ status: 'read-failed', updated: 0, flags: new Map() }))
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

  const uid = uidForCharacter(characterId);
  const [requests, pledges] = await Promise.all([
    loadRequests(characterId, communityId),
    loadCommunityPledges(characterId, communityId),
  ]);
  const planned = myOpenPledges(requests, pledges, uid, now);
  if (planned.length === 0) return { status: 'ok', updated: 0, flags: none };

  const slots: DeliverySlot[] = [];
  const requesters = new Set<number>();
  for (const { request, pledge } of planned) {
    const requester = characterIdForUid(request.ownerUid);
    if (requester !== null) requesters.add(requester);
    for (const [i, entry] of Object.entries(pledge.lines)) {
      const index = Number(i);
      const line = request.lines[index];
      if (!line) continue;
      slots.push({
        key: slotKey(request.id, index),
        line,
        quantity: entry.quantity,
        since: request.createdAt,
        order: request.createdAt * 100 + index,
        ...previousFromEntry(entry),
      });
    }
  }
  if (slots.length === 0 || requesters.size === 0) return { status: 'ok', updated: 0, flags: none };

  const contractsRead = await loadContracts(characterId);
  if (contractsRead.needsReauth) return { status: 'needs-scope', updated: 0, flags: none };
  if (!contractsRead.cached) return { status: 'read-failed', updated: 0, flags: none };
  let degraded = contractsRead.cached.truncated;

  const since = Math.min(...planned.map((p) => p.request.createdAt));
  const eligible = eligibleContracts(contractsRead.cached.data, characterId, requesters, since);
  const contracts: DeliveryContract[] = [];
  let reads = 0;
  for (const contract of eligible) {
    if (reads >= MAX_ITEM_READS_PER_RUN) {
      degraded = true;
      break;
    }
    reads += 1;
    const items = await loadContractItems(characterId, contract.contract_id).catch(() => null);
    if (!items) {
      degraded = true;
      continue;
    }
    contracts.push({
      contractId: contract.contract_id,
      completedAt: contractCompletedAt(contract),
      items: items.data.map(toDeliveryItem).filter((item): item is DeliveryItem => item !== null),
    });
  }

  const result = matchDeliveries(slots, contracts);
  const flags = new Map<string, readonly DeliveryFlag[]>();
  for (const [key, value] of result) if (value.flags.length > 0) flags.set(key, value.flags);

  let updated = 0;
  let writeFailed = false;
  for (const { request, pledge } of planned) {
    const changed: { index: number; entry: PledgeEntry }[] = [];
    for (const [i, entry] of Object.entries(pledge.lines)) {
      const index = Number(i);
      const next = result.get(slotKey(request.id, index));
      if (!next) continue;
      const same =
        next.delivered === entry.delivered &&
        next.contractIds.join(',') === (entry.contractIds ?? []).join(',');
      if (!same)
        changed.push({
          index,
          entry: { ...entry, delivered: next.delivered, contractIds: next.contractIds },
        });
    }
    for (const batch of batchLines(changed)) {
      try {
        await updateMyPledge(characterId, communityId, request.id, (lines) => {
          const out = { ...lines };
          for (const { index, entry } of batch) {
            const stored = out[index];
            // Withdrawn meanwhile: nothing to mark.
            if (!stored) continue;
            out[index] = {
              ...stored,
              delivered: Math.min(entry.delivered, stored.quantity),
              contractIds: [...(entry.contractIds ?? [])],
            };
          }
          return out;
        });
        updated += batch.length;
      } catch (err) {
        // A closed or expired Request refuses the write: say nothing, it cannot be marked.
        if (!isRefusal(err)) writeFailed = true;
        break;
      }
    }
  }
  return {
    status: writeFailed ? 'write-failed' : degraded ? 'read-failed' : 'ok',
    updated,
    flags,
  };
}
