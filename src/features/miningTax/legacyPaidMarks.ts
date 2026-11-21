/**
 * The paid marks Assignments carried before a payment linked to a Payee (decision 20261120-235011):
 * `status: 'paid'` and a `payment` naming its lump sum and the transactions behind it. Each device
 * reads them once into the links they stand for, then clears them (`readLegacyPaidMarks`). A
 * link's id never depends on what the mark holds, so two devices reading the same mark make one
 * link. Pure.
 */
import type { MiningTaxAssignmentRecord, MiningTaxPaymentInfo } from '@/db';
import { utcDay } from '@/engine/localDay';
import type { PayeePaymentLink, PayeePaymentRef } from '@/engine/miningTax/payeeRunningAccount';

/**
 * A mark's payment as the newest legacy shape: the oldest stored a bare `journalRefId` /
 * `contractId`, sourced `auto` since the silent matcher wrote every such link.
 */
function normalizePaymentInfo(payment: MiningTaxPaymentInfo): MiningTaxPaymentInfo {
  const legacy = payment as MiningTaxPaymentInfo & { journalRefId?: number; contractId?: number };
  if (legacy.journalRefId === undefined && legacy.contractId === undefined) return payment;
  const { journalRefId, contractId, ...rest } = legacy;
  return {
    ...rest,
    journalLinks:
      rest.journalLinks ??
      (journalRefId === undefined ? undefined : [{ refId: journalRefId, source: 'auto' }]),
    contractLinks:
      rest.contractLinks ??
      (contractId === undefined ? undefined : [{ refId: contractId, source: 'auto' }]),
  };
}

/** A link read from paid marks, with the Character whose mark it was read from (its owner). */
export interface LegacyLink extends PayeePaymentLink {
  kind: 'legacy';
  characterId: number;
}

/**
 * One link per payment the marks recorded: `legacy:<paymentId>`, or `legacy:mark:<assignmentId>`
 * for a bare "mark paid". It pays the old payment's recorded amount (a bare mark: the day's tax);
 * the transactions the payment named are kept on it as `refs`, held but never paying on their own.
 */
export function legacyPaymentLinks(
  assignments: readonly MiningTaxAssignmentRecord[]
): LegacyLink[] {
  const marked = assignments
    .filter((a) => a.status === 'paid' && a.payeeId !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const firstOf = new Map<string, MiningTaxAssignmentRecord>();
  const out: LegacyLink[] = [];
  for (const a of marked) {
    if (a.payment) {
      if (!firstOf.has(a.payment.paymentId)) firstOf.set(a.payment.paymentId, a);
      continue;
    }
    // "Mark paid" with no payment recorded: the pilot said this day was paid, in full.
    out.push({
      payeeId: a.payeeId!,
      characterId: a.characterId,
      kind: 'legacy',
      refId: `mark:${a.id}`,
      amount: a.taxOwed,
      paidOn: a.paidAt !== undefined ? utcDay(a.paidAt) : a.date,
      source: 'manual',
    });
  }
  for (const [paymentId, first] of firstOf) {
    const payment = normalizePaymentInfo(first.payment!);
    const refs: PayeePaymentRef[] = [
      ...(payment.journalLinks ?? []).map((l) => ({ kind: 'journal' as const, refId: l.refId })),
      ...(payment.contractLinks ?? []).map((l) => ({ kind: 'contract' as const, refId: l.refId })),
    ];
    out.push({
      payeeId: first.payeeId!,
      characterId: first.characterId,
      kind: 'legacy',
      refId: paymentId,
      amount: payment.amount,
      paidOn: payment.paidOn,
      source: 'manual',
      ...(refs.length > 0 ? { refs } : {}),
    });
  }
  return out;
}
