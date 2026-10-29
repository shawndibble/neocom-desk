/**
 * Linking a held buyback Quote to the item exchange contracts the seller made
 * for it (issue #4780). Pure: the caller reads ESI and writes Firestore. Only a
 * contract id and a status ever leave this module for Firestore; the price a
 * contract was made at stays with the two people who can read the contract,
 * and each compares it with the quoted total on their own side.
 */
import { isFinishedContractStatus } from '../contracts/contractStatus';
import type { HeldQuote, QuoteContractStatus } from './buyback';
import { MINUTE_MS } from '@/lib/age';

export type { QuoteContractStatus };

/** Contracts one quote links: the newest few. A seller who makes more than this has a bigger problem than a missing link. */
export const MAX_LINKED_CONTRACTS = 5;
/** ESI stamps a contract with its own clock and the quote with the client's: a fast client must not lose a real match. */
export const LINK_CLOCK_SLACK_MS = 10 * MINUTE_MS;

/** The subset of an ESI item exchange contract this module reads, with its included items. */
export interface BuybackContract {
  contractId: number;
  type: string;
  /** ESI's own status string. */
  status: string;
  issuerId: number;
  assigneeId: number;
  acceptorId: number;
  /** Ms since epoch. */
  dateIssued: number;
  dateExpired: number;
  price: number;
  /** What the issuer hands over: the contract's included items. */
  items: readonly { typeId: number; quantity: number }[];
}

export interface QuoteLink {
  contractId: number;
  status: QuoteContractStatus;
  /** The contract's price is not the quoted total. */
  priceDiffers: boolean;
}

/** What a contract's ESI status means for a quote; null for one that no longer stands (cancelled, deleted, failed). */
export function quoteContractStatus(
  status: string,
  dateExpired: number,
  now: number
): QuoteContractStatus | null {
  if (status === 'outstanding') return dateExpired <= now ? 'expired' : 'outstanding';
  if (status === 'in_progress') return 'inProgress';
  if (isFinishedContractStatus(status)) return 'finished';
  if (status === 'rejected') return 'rejected';
  return null;
}

export const priceDiffers = (contractPrice: number, quotedTotal: number) =>
  Math.round(contractPrice) !== Math.round(quotedTotal);

const totalsByType = (items: readonly { typeId: number; quantity: number }[]) => {
  const totals = new Map<number, number>();
  for (const item of items) totals.set(item.typeId, (totals.get(item.typeId) ?? 0) + item.quantity);
  return totals;
};

function sameItems(
  quoted: ReadonlyMap<number, number>,
  items: readonly { typeId: number; quantity: number }[]
): boolean {
  const offered = totalsByType(items);
  if (offered.size !== quoted.size) return false;
  for (const [typeId, quantity] of quoted) if (offered.get(typeId) !== quantity) return false;
  return true;
}

/**
 * The seller's contracts that are this quote's: item exchanges they issued to
 * (or that were accepted by) the buyer, made after the quote, carrying exactly
 * the quoted items. Newest first. A different price does not unlink one: it is
 * marked, so the buyer can reject it knowingly.
 */
export function linkQuoteContracts(
  quote: HeldQuote,
  sellerId: number,
  buyerId: number,
  contracts: readonly BuybackContract[],
  now: number
): QuoteLink[] {
  const quoted = totalsByType(quote.lines);
  return contracts
    .filter(
      (c) =>
        c.type === 'item_exchange' &&
        c.issuerId === sellerId &&
        (c.assigneeId === buyerId || c.acceptorId === buyerId) &&
        c.dateIssued >= quote.quotedAt - LINK_CLOCK_SLACK_MS &&
        sameItems(quoted, c.items)
    )
    .sort((a, b) => b.dateIssued - a.dateIssued || b.contractId - a.contractId)
    .flatMap((c) => {
      const status = quoteContractStatus(c.status, c.dateExpired, now);
      return status === null
        ? []
        : [{ contractId: c.contractId, status, priceDiffers: priceDiffers(c.price, quote.total) }];
    })
    .slice(0, MAX_LINKED_CONTRACTS);
}

/**
 * Whether a contract, read from the buyer's own list, is the seller's item
 * exchange to the buyer. A link is the seller's claim: only the buyer's copy of
 * the contract can back it, so one that is not this is a contract some other
 * party made, named by a seller who wants it attributed to a quote.
 */
export function isSellersContractToBuyer(
  contract: {
    type: string;
    issuer_id: number;
    assignee_id: number;
    acceptor_id: number;
    for_corporation?: boolean;
  },
  sellerId: number | null,
  buyerId: number
): boolean {
  return (
    sellerId !== null &&
    contract.type === 'item_exchange' &&
    contract.issuer_id === sellerId &&
    (contract.assignee_id === buyerId || contract.acceptor_id === buyerId)
  );
}
