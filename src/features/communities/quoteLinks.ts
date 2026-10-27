/**
 * Links a held buyback Quote to the seller's contracts (issue #4780). Reads the
 * seller's own contracts to the buyer Character since the quote, reads their
 * items (cached for good), runs the pure matcher in
 * `engine/communities/buybackContracts.ts`, and saves the ids and statuses on
 * the quote when they changed. Only ids and statuses reach Firestore: never a
 * price, the issuer or the items.
 */
import type { Contract } from '@/esi/endpoints';
import type { HeldQuote, QuoteLinkRef } from '@/engine/communities/buyback';
import {
  LINK_CLOCK_SLACK_MS,
  linkQuoteContracts,
  type BuybackContract,
  type QuoteLink,
} from '@/engine/communities/buybackContracts';
import type { CommunityRequest } from '@/engine/communities/requests';
import { loadContractItemsDetailed } from '@/features/character/contractItems';
import { loadContracts } from '@/features/character/contracts';
import { characterIdForUid } from '@/sync/uid';
import { saveQuoteLinks } from './requestStore';

/** Item reads one run may make; the rest wait for the next run (a read item list is cached for good). */
const MAX_ITEM_READS = 20;

export type QuoteLinkStatus = 'ok' | 'needs-scope' | 'read-failed';

export interface QuoteLinksResult {
  status: QuoteLinkStatus;
  links: QuoteLink[];
  /** The seller's own contracts by id, for opening the detail modal. */
  contracts: ReadonlyMap<number, Contract>;
}

/** The Character the contracts go to: the named buyer, else the requester. Null when neither is a Character. */
export const buyerOf = (request: CommunityRequest): number | null =>
  request.standing?.buyerCharacterId ?? characterIdForUid(request.ownerUid);

const same = (a: readonly QuoteLinkRef[] | undefined, b: readonly QuoteLinkRef[]) =>
  (a?.length ?? 0) === b.length &&
  b.every((link, i) => a?.[i]?.contractId === link.contractId && a[i].status === link.status);

export async function syncQuoteLinks({
  characterId,
  communityId,
  request,
  quote,
  now,
}: {
  characterId: number;
  communityId: string;
  request: CommunityRequest;
  quote: HeldQuote;
  now: number;
}): Promise<QuoteLinksResult> {
  const none = (status: QuoteLinkStatus): QuoteLinksResult => ({
    status,
    links: [],
    contracts: new Map(),
  });
  const buyerId = buyerOf(request);
  if (buyerId === null) return none('ok');
  const read = await loadContracts(characterId).catch(() => null);
  if (read?.needsReauth) return none('needs-scope');
  if (!read?.cached) return none('read-failed');

  // Only this seller's own item exchanges to the buyer, made since the quote, have items worth reading.
  const candidates = read.cached.data.filter(
    (c) =>
      c.issuer_id === characterId &&
      !c.for_corporation &&
      c.type === 'item_exchange' &&
      (c.assignee_id === buyerId || c.acceptor_id === buyerId) &&
      Date.parse(c.date_issued) >= quote.quotedAt - LINK_CLOCK_SLACK_MS
  );
  const facts: BuybackContract[] = [];
  const byId = new Map<number, Contract>();
  let reads = 0;
  let degraded = read.cached.truncated;
  for (const c of candidates) {
    if (reads >= MAX_ITEM_READS) {
      degraded = true;
      break;
    }
    const outcome = await loadContractItemsDetailed(characterId, c.contract_id).catch(() => null);
    if (outcome?.networkRead) reads += 1;
    if (!outcome?.result) {
      degraded = true;
      continue;
    }
    byId.set(c.contract_id, c);
    facts.push({
      contractId: c.contract_id,
      type: c.type,
      status: c.status,
      issuerId: c.issuer_id,
      assigneeId: c.assignee_id,
      acceptorId: c.acceptor_id,
      dateIssued: Date.parse(c.date_issued),
      dateExpired: Date.parse(c.date_expired),
      price: c.price ?? 0,
      items: outcome.result.data
        .filter((item) => item.is_included)
        .map((item) => ({ typeId: item.type_id, quantity: item.quantity })),
    });
  }
  // Something unread may be a link: keep what is stored rather than overwrite it with less.
  if (degraded && facts.length === 0 && candidates.length > 0) return none('read-failed');

  const links = linkQuoteContracts(quote, characterId, buyerId, facts, now);
  const refs: QuoteLinkRef[] = links.map(({ contractId, status }) => ({ contractId, status }));
  if (!degraded && !same(quote.links, refs)) {
    await saveQuoteLinks(characterId, communityId, request.id, quote.quotedAt, refs).catch(
      (err: unknown) => console.warn('Quote links could not be saved', err)
    );
  }
  return { status: degraded ? 'read-failed' : 'ok', links, contracts: byId };
}
