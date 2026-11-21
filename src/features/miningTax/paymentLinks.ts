/**
 * Which Payee a payment the pilot already made was for (issue #540, decision 20261120-235011,
 * "linking money under one payment model"). A Made Payment links to one Payee and pays its oldest
 * unpaid days (`PayeeAccount`), so a suggestion only has to name the recipient: never entries, and
 * no day window, since back taxes are paid weeks later. The recipient is known by the entity a
 * Payee learned, then by its name, across every record of a merged Payee, so an alt's payment is
 * found too. An amount alone is the weakest hint, offered only when exactly one Payee owes it, and
 * never for a donation a Corp Tax Book counts: that money is the book's.
 *
 * Pure: the route feeds it the normalized payments (`madePayments.ts`), the Payees with what they
 * owe, and which payments a link or a book already holds.
 */
import type { MiningTaxPaymentMethod, PayeeRecord } from '@/db';
import { utcDaysBetween } from '@/engine/localDay';
import { paymentLinkKey, type PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { isCorpPayeeId } from './corpBook/corpRows';
import { amountsMatch } from './paymentMatches';

/**
 * One payment the pilot has already made, normalized across its two sources: an outgoing
 * wallet-journal entry, or an item-exchange contract they issued at no price (payment in kind).
 */
export interface MadePayment {
  /** `journal:<id>` or `contract:<id>` (`paymentLinkKey`): the two id spaces collide. */
  key: string;
  kind: 'journal' | 'contract';
  refId: number;
  /** The paying character. */
  characterId: number;
  /** ISO timestamp the ISK (or the cargo) left. */
  date: string;
  /**
   * Positive ISK. `null` for a payment-in-kind contract: its cargo is never priced (the decision
   * doc rules out a second valuation model), so the pilot gives its figure when linking it.
   */
  amount: number | null;
  /** Decided once at the source from the journal `ref_type` (or the fact that it is a contract). */
  method: MiningTaxPaymentMethod;
  /** Who received it: the journal's `second_party_id` or the contract's `assignee_id`. */
  counterpartyId?: number;
  counterpartyName?: string;
  /** One-line description for the picker: a humanized ESI ref type, or the contract's title. */
  label: string;
}

/** How the recipient was known, best first. */
export type LinkConfidence = 'entity' | 'name' | 'amount';

/** A personal Payee a payment may be linked to: every record of one recipient. */
export interface LinkablePayee {
  /** The merged Payee's primary record id: the link names it. */
  id: string;
  name: string;
  /** Every record of the recipient, the primary first. */
  members: readonly PayeeRecord[];
  /** What its account owes now. */
  owed: number;
  /** Whether anything was ever billed to it: a Payee nothing bills is no one's recipient yet. */
  billed: boolean;
}

export interface LinkSuggestion {
  payment: MadePayment;
  payee: LinkablePayee;
  confidence: LinkConfidence;
}

/** What a suggestion is weighed against. */
export interface LinkContext {
  payees: readonly LinkablePayee[];
  /** The keys of the payments a link already holds (`paymentLinkKey`). */
  linked: ReadonlySet<string>;
  /**
   * The corporations of the member's Corp Tax Books: a donation to one is the book's (held, or in
   * flight), and never a personal Payee's.
   */
  bookCorporations: ReadonlySet<number>;
}

/** The payments a pilot may still link: no link holds them, and no book counts them. */
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

/**
 * How one record knows the recipient: `entity` is the id it learned from an earlier link (or the
 * pilot verified); `name` is the weaker bootstrap for a record that learned nothing. A record that
 * learned an entity is never matched by name.
 */
function identityKind(payee: PayeeRecord, payment: MadePayment): 'entity' | 'name' | null {
  if (payee.entityId !== undefined && payment.counterpartyId !== undefined)
    return payee.entityId === payment.counterpartyId ? 'entity' : null;
  if (payment.counterpartyName === undefined) return null;
  return payee.name.trim().toLowerCase() === payment.counterpartyName.trim().toLowerCase()
    ? 'name'
    : null;
}

/**
 * The personal Payee a payment went to: the one whose records know its recipient, by entity
 * first, then by name. Undefined when none does, or two Payees answer equally (the pilot picks).
 */
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

/**
 * The Payee a payment was most likely for, or null: its recipient (a Payee anything was billed
 * to), else the one Payee whose owed figure it matches. Nothing plausible is never offered.
 */
export function suggestLink(payment: MadePayment, ctx: LinkContext): LinkSuggestion | null {
  if (linkablePayments([payment], ctx).length === 0) return null;
  const known = recipientOf(
    payment,
    ctx.payees.filter((p) => p.billed)
  );
  if (known) return { payment, ...known };
  if (payment.amount === null) return null;
  const amount = payment.amount;
  const byAmount = ctx.payees.filter(
    (p) => !isCorpPayeeId(p.id) && p.owed > 0 && amountsMatch(p.owed, amount)
  );
  return byAmount.length === 1 ? { payment, payee: byAmount[0]!, confidence: 'amount' } : null;
}

/** Every payment worth offering, the surest first, then newest. */
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

/** How far a transaction may drift from the date a recorded payment said. */
const RECORDED_LINK_WINDOW_DAYS = 3;

/**
 * A recorded payment (Settle up, before its transaction showed up) and the one transaction behind
 * it: to its Payee's recipient, of its amount, within a few days. One to one or nothing: a
 * recorded payment with two candidates, or a transaction two recorded payments could be, is left
 * for the pilot.
 */
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
                amountsMatch(link.amount, p.amount) &&
                Math.abs(utcDaysBetween(link.paidOn, p.date.slice(0, 10))) <=
                  RECORDED_LINK_WINDOW_DAYS &&
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

/** The link a Made Payment becomes once linked to `payeeId`: a payment in kind takes `amount`. */
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
    paidOn: payment.date.slice(0, 10),
    source,
  };
}

/** The made payment behind a link, when the wallet or contracts still hold it. */
export function paymentOfLink(
  link: Pick<PayeePaymentLink, 'kind' | 'refId'>,
  payments: readonly MadePayment[]
): MadePayment | undefined {
  const key = paymentLinkKey(link);
  return payments.find((p) => p.key === key);
}
