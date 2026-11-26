import type { MiningTaxAssignmentRecord, MiningTaxPaymentInfo } from '@/db';
import { utcDay } from '@/engine/localDay';
import type { PayeePaymentLink, PayeePaymentRef } from '@/engine/miningTax/payeeRunningAccount';

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

export interface LegacyLink extends PayeePaymentLink {
  kind: 'legacy';
  characterId: number;
}

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
