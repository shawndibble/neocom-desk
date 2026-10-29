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
 * Contracts ESI answered a definite no for (404), by this session: when
 * first and how often. One that keeps failing so, over a few minutes, is given
 * up on, so a few bad ones cannot hold the rest back or use up every run's read
 * cap. Anything else (offline, a rate limit, a 5xx) is transient: it holds the
 * rest back this run but never counts toward giving up.
 */
const itemReadFailures = new Map<number, { count: number; first: number }>();
const GIVE_UP_AFTER = 2;
/** The failures must span at least this long: one burst on a flaky network is not a verdict. */
export const GIVE_UP_SPAN_MS = 5 * MINUTE_MS;

// Only a 404 is an answer about this contract alone. A 403 is the Permission itself (a revoke the
// local scope check cannot see): it would give up on every contract, so it is never a give-up.
const isDefiniteNo = (status: number | undefined) => status === 404;

const givenUp = (contractId: number, now: number) => {
  const failure = itemReadFailures.get(contractId);
  return (
    failure !== undefined &&
    failure.count >= GIVE_UP_AFTER &&
    now - failure.first >= GIVE_UP_SPAN_MS
  );
};

/** The eligible contracts with their items. Stops at the first transient failure (rate limit, offline). */
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
  // Oldest first: a capped or failed run reads the contracts that come first in time, so
  // what is left unread is always the newest and the horizon only ever holds back the tail.
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
  // Eligible contracts whose items were not read this run: nothing finishing at
  // or after the earliest of them is counted (see `matchDeliveries`). One given up
  // on after repeated definite failures is skipped for good instead: it never
  // counts and does not hold the rest back.
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
    // Already counted by every Pledge that could take it: nothing to read, nothing to hold back.
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
    // Only a read that went to ESI counts against the run's cap.
    if (outcome.networkRead) reads += 1;
    if (!outcome.result) {
      // The Permission is gone (or never was): stop, count nothing, and let the panel ask for the grant.
      if (outcome.failureStatus === 403) return { status: 'needs-scope' };
      degraded = true;
      hold(contract);
      if (isDefiniteNo(outcome.failureStatus)) {
        const before = itemReadFailures.get(contract.contract_id);
        itemReadFailures.set(contract.contract_id, {
          count: (before?.count ?? 0) + 1,
          first: before?.first ?? now,
        });
        // A definite answer about this contract alone: the others can still be read.
        continue;
      }
      // Offline, a rate limit or an error limit: do not press on, and do not count it against the contract.
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
    // It read: earlier failures of this contract were not a verdict.
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

/** Whether the Request is now closed or expired, read fresh; 'unknown' when that cannot be told. */
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

/** Whether an entry carries any contract-derived history. */
const hasHistory = (entry: PledgeEntry) =>
  (entry.auto ?? 0) > 0 || (entry.contractIds?.length ?? 0) > 0;

/**
 * Writes changed lines per Request in batches the rules accept. Returns lines
 * updated and whether a save failed. Stops quietly once the Member has edited a
 * Pledge by hand since the run began (`startVersion`): the run read it as it was.
 */
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
            // Withdrawn meanwhile: nothing to mark.
            if (!stored) continue;
            // Withdrawn and pledged afresh while this run was reading: its figures
            // belong to the old Pledge.
            if (hasHistory(before) && !hasHistory(stored)) continue;
            // Never lower what is stored (another device may be ahead); the typed
            // amount typed since this run read the Pledge is in `stored`, not in
            // the run, so it survives and one cleared meanwhile does not come back.
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
        // Only a Request that really closed or expired meanwhile is quiet: a
        // denial for any other reason (session, rules) is a failed save.
        const denied = (err as { code?: string } | null)?.code === 'permission-denied';
        // An unknown state is a failed save too: it is not quiet until it is known.
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

/**
 * One run for one Character in one Community. Concurrent calls for the same
 * pair (the background sweep and a panel opening) share one run, unless the
 * Member has edited a Pledge by hand since it began: that run read the old
 * Pledge, so a fresh one starts. Never throws.
 */
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

  // Only this Character's own Pledges, then only the Requests they are on: a sweep with nothing
  // pledged is one read, not the whole board and every Pledge in the Community.
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
