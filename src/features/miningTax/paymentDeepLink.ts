/**
 * The wallet journal → Moon Mining Tax link: a journal entry (or contract) a
 * pilot linked to a tax payment opens the Tax tab on the row it settled.
 * The URL names the transaction, not the row — which row that is depends on
 * the Tax tab's own grouping, so `findRowForPaymentRef` resolves it there.
 */
import { normalizePaymentInfo } from './paymentLinks';
import { allMembers, type DisplayRow } from './groupRows';

/** `tax.`-scoped like the Tax tab's other params, which `usePageTab` carries across tabs. */
export const PAYMENT_REF_PARAM = 'tax.payment';

export type PaymentRef = { kind: 'journal' | 'contract'; id: number };

export function miningTaxPaymentHref(ref: PaymentRef): string {
  const params = new URLSearchParams({ [PAYMENT_REF_PARAM]: `${ref.kind}:${ref.id}` });
  return `/mining/tax?${params.toString()}`;
}

export function parsePaymentRefParam(raw: string | null): PaymentRef | null {
  const match = /^(journal|contract):(\d+)$/.exec(raw ?? '');
  if (!match) return null;
  const id = Number(match[2]);
  return id > 0 ? { kind: match[1] as PaymentRef['kind'], id } : null;
}

/**
 * The row a transaction was applied to. One lump sum often settles several
 * days, so more than one row can match: the newest wins, and its payment card
 * shows the rest of the sum.
 */
export function findRowForPaymentRef(
  rows: readonly DisplayRow[],
  ref: PaymentRef
): DisplayRow | null {
  let best: DisplayRow | null = null;
  for (const dr of rows) {
    const linked = allMembers(dr).some(({ assignment }) => {
      if (!assignment.payment) return false;
      const payment = normalizePaymentInfo(assignment.payment);
      const links = ref.kind === 'journal' ? payment.journalLinks : payment.contractLinks;
      return (links ?? []).some((link) => link.refId === ref.id);
    });
    if (linked && (best === null || dr.row.entry.date > best.row.entry.date)) best = dr;
  }
  return best;
}
