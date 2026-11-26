import { utcDayOf } from '../../../functions/src/timeConstants';
import type { MiningTaxPaymentMethod, PayeeRecord } from '@/db';
import { matchesStatedTransfer } from '../../../functions/src/corpTaxBookTransferMatch';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { isCorpPayeeId } from './corpBook/corpRows';
import { amountsMatch } from './paymentMatches';

export interface MadePayment {
  key: string;
  kind: 'journal' | 'contract';
  refId: number;
  characterId: number;
  date: string;
  amount: number | null;
  method: MiningTaxPaymentMethod;
  counterpartyId?: number;
  counterpartyName?: string;
  label: string;
}

export type LinkConfidence = 'entity' | 'name' | 'amount';

export interface LinkablePayee {
  id: string;
  name: string;
  members: readonly PayeeRecord[];
  owed: number;
  billed: boolean;
}

export interface LinkSuggestion {
  payment: MadePayment;
  payee: LinkablePayee;
  confidence: LinkConfidence;
}

export interface LinkContext {
  payees: readonly LinkablePayee[];
  linked: ReadonlySet<string>;
  bookCorporations: ReadonlySet<number>;
}

export function linkablePayments(
  payments: readonly MadePayment[],
  ctx: Pick<LinkContext, 'linked' | 'bookCorporations'>
): MadePayment[] {
  return payments.filter(
    (p) =>
      !ctx.linked.has(p.key) &&
      (p.counterpartyId === undefined || !ctx.bookCorporations.has(p.counterpartyId))
  );
}

function identityKind(payee: PayeeRecord, payment: MadePayment): 'entity' | 'name' | null {
  if (payee.entityId !== undefined && payment.counterpartyId !== undefined)
    return payee.entityId === payment.counterpartyId ? 'entity' : null;
  if (payment.counterpartyName === undefined) return null;
  return payee.name.trim().toLowerCase() === payment.counterpartyName.trim().toLowerCase()
    ? 'name'
    : null;
}

export function recipientOf(
  payment: MadePayment,
  payees: readonly LinkablePayee[]
): { payee: LinkablePayee; confidence: 'entity' | 'name' } | undefined {
  const kindOf = (p: LinkablePayee) => {
    const kinds = p.members.map((m) => identityKind(m, payment));
    return kinds.includes('entity') ? 'entity' : kinds.includes('name') ? 'name' : null;
  };
  const personal = payees.filter((p) => !isCorpPayeeId(p.id));
  for (const confidence of ['entity', 'name'] as const) {
    const found = personal.filter((p) => kindOf(p) === confidence);
    if (found.length === 1) return { payee: found[0]!, confidence };
    if (found.length > 1) return undefined;
  }
  return undefined;
}

export function suggestLink(payment: MadePayment, ctx: LinkContext): LinkSuggestion | null {
  if (linkablePayments([payment], ctx).length === 0) return null;
  const known = recipientOf(
    payment,
    ctx.payees.filter((p) => p.billed)
  );
  if (known) return { payment, ...known };
  if (payment.amount === null || payment.counterpartyId !== undefined) return null;
  const amount = payment.amount;
  const byAmount = ctx.payees.filter(
    (p) => !isCorpPayeeId(p.id) && p.owed > 0 && amountsMatch(p.owed, amount)
  );
  return byAmount.length === 1 ? { payment, payee: byAmount[0]!, confidence: 'amount' } : null;
}

export function unlinkedSentFor(
  suggestions: readonly LinkSuggestion[],
  payeeId: string
): { count: number; amount: number } | undefined {
  const mine = suggestions.filter((s) => s.payee.id === payeeId);
  if (mine.length === 0) return undefined;
  return { count: mine.length, amount: mine.reduce((sum, s) => sum + (s.payment.amount ?? 0), 0) };
}

export function suggestLinks(payments: readonly MadePayment[], ctx: LinkContext): LinkSuggestion[] {
  const rank: Record<LinkConfidence, number> = { entity: 0, name: 1, amount: 2 };
  return payments
    .map((p) => suggestLink(p, ctx))
    .filter((s): s is LinkSuggestion => s !== null)
    .sort(
      (a, b) =>
        rank[a.confidence] - rank[b.confidence] || b.payment.date.localeCompare(a.payment.date)
    );
}

export function autoMatchRecorded(
  payments: readonly MadePayment[],
  recorded: readonly PayeePaymentLink[],
  ctx: LinkContext
): { link: PayeePaymentLink; payment: MadePayment }[] {
  const open = linkablePayments(payments, ctx);
  const payeeOf = (payeeId: string) =>
    ctx.payees.find((p) => p.members.some((m) => m.id === payeeId));
  const candidates = recorded
    .filter((l) => l.kind === 'recorded')
    .map((link) => {
      const payee = payeeOf(link.payeeId);
      return {
        link,
        payments: payee
          ? open.filter(
              (p) =>
                p.amount !== null &&
                matchesStatedTransfer(
                  {
                    ...(link.characterId !== undefined ? { characterId: link.characterId } : {}),
                    amount: link.amount,
                    at: `${link.paidOn}T12:00:00.000Z`,
                  },
                  { characterId: p.characterId, amount: p.amount, at: p.date }
                ) &&
                recipientOf(p, [payee]) !== undefined
            )
          : [],
      };
    });
  const claims = new Map<string, number>();
  for (const c of candidates)
    for (const p of c.payments) claims.set(p.key, (claims.get(p.key) ?? 0) + 1);
  return candidates.flatMap((c) =>
    c.payments.length === 1 && claims.get(c.payments[0]!.key) === 1
      ? [{ link: c.link, payment: c.payments[0]! }]
      : []
  );
}

export function linkFor(
  payment: MadePayment,
  payeeId: string,
  source: PayeePaymentLink['source'],
  amount = payment.amount ?? 0
): PayeePaymentLink {
  return {
    payeeId,
    kind: payment.kind,
    refId: payment.refId,
    amount,
    paidOn: utcDayOf(payment.date),
    source,
  };
}
