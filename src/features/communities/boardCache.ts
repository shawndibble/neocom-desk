/**
 * A Community's Requests board, cached per Character and Community (issue #5244). Opening the board
 * reads only the version stamp (`loadBoardVersion`); when it has not moved the cached board is
 * shown. When it has, only the Requests and Pledges written since the cache's watermark are read
 * and merged in. A stamp whose `reset` moved (a Request or Pledge was deleted, which a delta cannot
 * show), a cache older than `BOARD_MAX_AGE_MS`, or a delta that fails, reads the whole board again.
 */
import type {
  CommunityRequest,
  PledgesByRequest,
  RequestPledge,
} from '@/engine/communities/requests';
import {
  loadBoardVersion,
  loadCommunityPledges,
  loadCommunityPledgesSince,
  loadRequests,
  loadRequestsActiveSince,
} from './requestStore';

/** Backstop for a deletion made without a stamp (an older callable, a failed stamp write). */
export const BOARD_MAX_AGE_MS = 15 * 60 * 1000;

interface CachedBoard {
  requests: Map<string, CommunityRequest>;
  pledges: PledgesByRequest;
  stamp: number;
  reset: number;
  loadedAt: number;
}

export interface Board {
  requests: CommunityRequest[];
  /** Null when the Pledge read failed: the board must not pass an unread Request off as Open. */
  pledges: PledgesByRequest | null;
}

const cache = new Map<string, CachedBoard>();

export function clearBoardCache(): void {
  cache.clear();
}

const newestFirst = (requests: Iterable<CommunityRequest>): CommunityRequest[] =>
  [...requests].sort((a, b) => b.createdAt - a.createdAt);

/** The newest `lastActivityAt` in the cache: what the next delta reads from. */
const requestMark = (requests: ReadonlyMap<string, CommunityRequest>): number =>
  Math.max(0, ...[...requests.values()].map((r) => r.lastActivityAt));

const pledgeMark = (pledges: PledgesByRequest): number =>
  Math.max(0, ...[...pledges.values()].flatMap((list) => list.map((p) => p.updatedAt)));

function mergePledges(
  before: PledgesByRequest,
  delta: ReadonlyMap<string, RequestPledge[]>
): PledgesByRequest {
  const merged = new Map(before);
  for (const [requestId, changed] of delta) {
    const kept = (merged.get(requestId) ?? []).filter((p) => !changed.some((c) => c.uid === p.uid));
    merged.set(requestId, [...kept, ...changed]);
  }
  return merged;
}

async function readWhole(characterId: number, communityId: string): Promise<Board> {
  const [requests, pledges] = await Promise.all([
    loadRequests(characterId, communityId),
    loadCommunityPledges(characterId, communityId).catch((err) => {
      console.warn('Community Pledges could not be read', err);
      return null;
    }),
  ]);
  return { requests, pledges };
}

/** The Community's board: from the cache when the stamp has not moved, else a delta or a whole read. */
export async function loadBoard(
  characterId: number,
  communityId: string,
  now = Date.now()
): Promise<Board> {
  const key = `${characterId}:${communityId}`;
  const version = await loadBoardVersion(characterId, communityId);
  if (version === null) return readWhole(characterId, communityId);
  const held = cache.get(key);
  const fresh =
    held !== undefined && now - held.loadedAt < BOARD_MAX_AGE_MS && held.reset === version.reset;
  if (held && fresh) {
    if (held.stamp === version.stamp) {
      return { requests: newestFirst(held.requests.values()), pledges: held.pledges };
    }
    try {
      const [changedRequests, changedPledges] = await Promise.all([
        loadRequestsActiveSince(characterId, communityId, requestMark(held.requests)),
        loadCommunityPledgesSince(characterId, communityId, pledgeMark(held.pledges)),
      ]);
      const requests = new Map(held.requests);
      for (const request of changedRequests) requests.set(request.id, request);
      const next: CachedBoard = {
        requests,
        pledges: mergePledges(held.pledges, changedPledges),
        stamp: version.stamp,
        reset: version.reset,
        loadedAt: held.loadedAt,
      };
      cache.set(key, next);
      return { requests: newestFirst(requests.values()), pledges: next.pledges };
    } catch (err) {
      console.warn('Community board delta could not be read; reading it whole', err);
    }
  }
  const board = await readWhole(characterId, communityId);
  if (board.pledges) {
    cache.set(key, {
      requests: new Map(board.requests.map((r) => [r.id, r])),
      pledges: board.pledges,
      stamp: version.stamp,
      reset: version.reset,
      loadedAt: now,
    });
  } else {
    cache.delete(key);
  }
  return board;
}
