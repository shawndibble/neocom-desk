/**
 * Community Requests client (issue #3807, ADR 0021): the board reads through
 * Firestore under the membership rules; posting, extending, closing and
 * reopening go through the Request callables, which hold the caps. Firestore
 * here is the `lite` build (no listeners), so callers refetch after a change.
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import type { CommunityRequest, RequestLine, RequestLineKind } from '@/engine/communities/requests';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { communityBackendOverride } from './backendOverride';
import { callCommunity } from './communityStore';

const KINDS: readonly RequestLineKind[] = ['item', 'bpc', 'bpo'];

function readLine(raw: unknown): RequestLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const kind = KINDS.find((k) => k === d.kind) ?? 'item';
  if (typeof d.typeId !== 'number' || typeof d.quantity !== 'number') return null;
  const line: RequestLine = {
    typeId: d.typeId,
    name: String(d.name ?? ''),
    quantity: d.quantity,
    kind,
  };
  if (typeof d.runs === 'number') line.runs = d.runs;
  if (typeof d.me === 'number') line.me = d.me;
  if (typeof d.te === 'number') line.te = d.te;
  return line;
}

/** Every Request on a Community's board, newest first. A document that does not read as a Request is skipped. */
export async function loadRequests(
  characterId: number,
  communityId: string
): Promise<CommunityRequest[]> {
  const override = communityBackendOverride();
  if (override?.loadItemRequests) return override.loadItemRequests(communityId);
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    collection(getSyncFirestore(), 'communities', communityId, 'itemRequests')
  );
  return snap.docs
    .map((entry): CommunityRequest | null => {
      const d = entry.data();
      const lines = (Array.isArray(d.lines) ? d.lines : [])
        .map(readLine)
        .filter((line): line is RequestLine => line !== null);
      if (lines.length === 0) return null;
      return {
        id: entry.id,
        ownerUid: String(d.ownerUid ?? ''),
        ownerName: String(d.ownerName ?? ''),
        location: String(d.location ?? ''),
        terms: String(d.terms ?? ''),
        lines,
        createdAt: Number(d.createdAt ?? 0),
        lastActivityAt: Number(d.lastActivityAt ?? 0),
        expiresAt: Number(d.expiresAt ?? 0),
        closed: d.closed === true,
      };
    })
    .filter((request): request is CommunityRequest => request !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface PostRequestDraft {
  location: string;
  terms: string;
  lines: RequestLine[];
}

export function postRequest(characterId: number, communityId: string, draft: PostRequestDraft) {
  return callCommunity<PostRequestDraft & { communityId: string }, { requestId: string }>(
    characterId,
    'postCommunityRequestCallable',
    { communityId, ...draft }
  );
}

export function extendRequest(characterId: number, communityId: string, requestId: string) {
  return callCommunity<{ communityId: string; requestId: string }, { expiresAt: number }>(
    characterId,
    'extendCommunityRequestCallable',
    { communityId, requestId }
  );
}

/** Close a Request, or reopen a closed one. */
export async function setRequestClosed(
  characterId: number,
  communityId: string,
  requestId: string,
  closed: boolean
): Promise<void> {
  await callCommunity(characterId, 'setCommunityRequestClosedCallable', {
    communityId,
    requestId,
    closed,
  });
}
