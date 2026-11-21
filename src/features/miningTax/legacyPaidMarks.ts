/**
 * The paid marks Assignments carried before a payment linked to a Payee (decision 20261120-235011):
 * `status: 'paid'` and a `payment` naming its lump sum and the transactions behind it. They stay
 * readable, since dev and production share one Firebase project and an older client still writes
 * them, but nothing reads them for what is paid any more. Each is read once into the link it
 * stands for (`readLegacyPaidMarks`), under a key derived from the mark itself, so reading it
 * again finds the link already there. Pure.
 */
import type { MiningTaxAssignmentRecord } from '@/db';
import { utcDay } from '@/engine/localDay';
import { paymentLinkKey, type PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { normalizePaymentInfo } from './paymentLinks';

/** A link read from paid marks, with the Character whose Payee record it names. */
export interface LegacyLink extends PayeePaymentLink {
  characterId: number;
  /** The Assignments whose marks it was read from. */
  from: string[];
}

/** One link per payment the marks recorded: per transaction behind it, else the recorded sum. */
export function legacyPaymentLinks(
  assignments: readonly MiningTaxAssignmentRecord[]
): LegacyLink[] {
  const marked = assignments
    .filter((a) => a.status === 'paid' && a.payeeId !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const groups = new Map<string, MiningTaxAssignmentRecord[]>();
  const out: LegacyLink[] = [];
  for (const a of marked) {
    if (a.payment) {
      groups.set(a.payment.paymentId, [...(groups.get(a.payment.paymentId) ?? []), a]);
      continue;
    }
    // "Mark paid" with no payment recorded: the pilot said this day was paid, in full.
    out.push({
      payeeId: a.payeeId!,
      characterId: a.characterId,
      kind: 'recorded',
      refId: `mark:${a.id}`,
      amount: a.taxOwed,
      paidOn: a.paidAt !== undefined ? utcDay(a.paidAt) : a.date,
      source: 'manual',
      from: [a.id],
    });
  }
  for (const [paymentId, members] of groups) {
    const first = members[0]!;
    const payment = normalizePaymentInfo(first.payment!);
    const refs = [
      ...(payment.journalLinks ?? []).map((l) => ({ kind: 'journal' as const, ...l })),
      ...(payment.contractLinks ?? []).map((l) => ({ kind: 'contract' as const, ...l })),
    ];
    const shared = {
      payeeId: first.payeeId!,
      characterId: first.characterId,
      paidOn: payment.paidOn,
      from: members.map((m) => m.id),
    };
    if (refs.length === 0) {
      out.push({
        ...shared,
        kind: 'recorded',
        refId: paymentId,
        amount: payment.amount,
        source: 'manual',
      });
      continue;
    }
    // The marks recorded only the lump sum: installments share it.
    for (const ref of refs)
      out.push({
        ...shared,
        kind: ref.kind,
        refId: ref.refId,
        amount: payment.amount / refs.length,
        source: ref.source,
      });
  }
  return out;
}

/** The legacy links not yet read: no link holds their payment's key. */
export function unreadLegacyLinks(
  assignments: readonly MiningTaxAssignmentRecord[],
  linkedKeys: ReadonlySet<string>
): LegacyLink[] {
  const seen = new Set(linkedKeys);
  return legacyPaymentLinks(assignments).filter((l) => {
    const key = paymentLinkKey(l);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
