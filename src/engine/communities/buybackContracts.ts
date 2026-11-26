import { isFinishedContractStatus } from '../contracts/contractStatus';
import type { HeldQuote, QuoteContractStatus } from './buyback';
import { MINUTE_MS } from '@/lib/age';

export type { QuoteContractStatus };

export const MAX_LINKED_CONTRACTS = 5;
export const LINK_CLOCK_SLACK_MS = 10 * MINUTE_MS;

export interface BuybackContract {
  contractId: number;
  type: string;
  status: string;
  issuerId: number;
  assigneeId: number;
  acceptorId: number;
  dateIssued: number;
  dateExpired: number;
  price: number;
  items: readonly { typeId: number; quantity: number }[];
}

export interface QuoteLink {
  contractId: number;
  status: QuoteContractStatus;
  priceDiffers: boolean;
}

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
