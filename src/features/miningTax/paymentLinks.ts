/**
 * Paying backwards (issue #540): given a payment the pilot has *already* made,
 * work out which outstanding Assignments it settled.
 *
 * The mirror of the Settle-up flow, which runs forward from "what shall I
 * pay?". Pure — the route feeds it the normalized payments (`madePayments.ts`)
 * and the Balances strip's own per-Payee figures (`balances.ts`), so the
 * matching rules stay testable without ESI or Dexie.
 */
import type { MiningTaxAssignmentRecord, MiningTaxPaymentMethod, PayeeRecord } from '@/db';
import { DAY_MS } from '@/lib/age';
import type { PayeeBalance } from './balances';
import type { GroupMember } from './groupRows';
import { amountsMatch, LINK_WINDOW_DAYS } from './paymentMatches';

/**
 * One payment the pilot has already made, normalized across its two sources:
 * an outgoing wallet-journal entry, or an item-exchange contract they issued
 * at no price (payment in kind).
 */
export interface MadePayment {
  /** `journal:<id>` or `contract:<id>` — a numeric id alone is ambiguous across the two sources. */
  key: string;
  kind: 'journal' | 'contract';
  /** Written to `payment.journalRefId` or `payment.contractId` when the link is confirmed. */
  refId: number;
  /** The paying character — a Payee is scoped to one character, so this narrows the candidates. */
  characterId: number;
  /** ISO timestamp the ISK (or the cargo) left. */
  date: string;
  /**
   * Positive ISK. `null` for a payment-in-kind contract: its cargo is
   * deliberately never priced (the decision doc rules out a second valuation
   * model beside the Jita snapshot Assignments already carry), so the amount
   * is confirmed by the pilot instead.
   */
  amount: number | null;
  /**
   * How this settles, decided once at the source from the journal `ref_type`
   * (or the fact that it is a contract) — never re-derived later from display
   * text, which would tie a domain fact to a copy tweak.
   */
  method: MiningTaxPaymentMethod;
  /** Who received it — the journal's `second_party_id` or the contract's `assignee_id`. */
  counterpartyId?: number;
  counterpartyName?: string;
  /**
   * One-line description for the picker: a humanized ESI ref type, or the
   * contract's own title. Empty when neither exists (an untitled contract) —
   * the dialog supplies a translated fallback rather than this module inventing
   * user-facing copy.
   */
  label: string;
}

/**
 * How sure the match is, best first — drives ordering and the wording shown
 * beside a suggestion.
 *
 * The `identity-*` tiers mean the recipient's EVE id matched what this Payee
 * learned. The `name-*` tiers are the weaker string match on a free-text Payee
 * label, kept distinct precisely because the decision doc rules name equality
 * out as *the* identity signal: it is what bootstraps the first link for a
 * Payee that has learned nothing yet, and it says so rather than claiming to
 * know the recipient.
 */
export type LinkConfidence =
  'identity-and-amount' | 'identity' | 'name-and-amount' | 'name' | 'amount';

export interface LinkSuggestion {
  payment: MadePayment;
  balance: PayeeBalance;
  /** The Assignments to pre-tick — the best-fit subset of `balance.members` inside the date window. */
  members: GroupMember[];
  confidence: LinkConfidence;
}

/** UTC calendar day index, from either a `YYYY-MM-DD` EVE date or a full ISO timestamp. */
export function utcDay(date: string): number {
  const iso = date.length === 10 ? `${date}T00:00:00Z` : date;
  return Math.floor(Date.parse(iso) / DAY_MS);
}

/**
 * Whether a Mining Ledger Entry could plausibly be what this payment settled.
 *
 * Asymmetric on purpose: a pilot pays *after* mining, and one payment covers a
 * span of entry dates. So an entry may sit up to `LINK_WINDOW_DAYS` before its
 * payment, but only one day after it — that single day of slack is for the
 * EVE/UTC calendar edge, where a session logged on the 7th UTC was really paid
 * for on the evening of the 6th. An entry any further ahead of its payment did
 * not exist yet when the ISK moved.
 */
export function withinLinkWindow(entryDate: string, paymentDate: string): boolean {
  const delta = utcDay(paymentDate) - utcDay(entryDate);
  return delta >= -1 && delta <= LINK_WINDOW_DAYS;
}

/** The journal and contract ids some Assignment already records a payment against. */
function linkedRefIds(assignments: readonly MiningTaxAssignmentRecord[]) {
  const journal = new Set<number>();
  const contract = new Set<number>();
  for (const a of assignments) {
    if (a.payment?.journalRefId !== undefined) journal.add(a.payment.journalRefId);
    if (a.payment?.contractId !== undefined) contract.add(a.payment.contractId);
  }
  return { journal, contract };
}

/**
 * Payments not already accounted for. Namespaced by kind: a journal entry id
 * and a contract id are separate id spaces that regularly collide.
 *
 * Note this test has a known false-negative edge — settle-up's later steps are
 * skippable, and "Just mark paid" records no `payment` at all, so a payment
 * settled that way stays eligible forever. That is why `suggestLink` only ever
 * offers a payment with a plausible target, rather than an ignore-list.
 */
export function unlinkedPayments(
  payments: readonly MadePayment[],
  assignments: readonly MiningTaxAssignmentRecord[]
): MadePayment[] {
  const linked = linkedRefIds(assignments);
  return payments.filter((p) => !linked[p.kind].has(p.refId));
}

/**
 * One Settle-up "Record payment" that has no live wallet/contract link yet —
 * every Assignment it covers, grouped by the shared `paymentId`
 * (`markAssignmentsPaid`'s `PaymentInput`). These are exactly the Assignments
 * `unlinkedPayments`'s doc comment calls out as staying eligible forever: once
 * Settle-up marks them `paid`, they drop out of `computePayeeBalances`'s
 * "owed" set, so `suggestLink`'s dialog never offers them a link again. This
 * is the other half — matching them automatically, later, once ESI actually
 * shows the transaction.
 */
export interface RecordedPaymentGroup {
  paymentId: string;
  amount: number;
  /** The pilot's own recorded paid-on date — a local calendar date, not an EVE one. */
  paidOn: string;
  /** Whichever of the pilot's characters could plausibly have sent it — a lump sum can cover alts' Assignments together. */
  characterIds: ReadonlySet<number>;
  assignments: readonly MiningTaxAssignmentRecord[];
}

export function unlinkedRecordedPayments(
  assignments: readonly MiningTaxAssignmentRecord[]
): RecordedPaymentGroup[] {
  const groups = new Map<
    string,
    { amount: number; paidOn: string; members: MiningTaxAssignmentRecord[] }
  >();
  for (const a of assignments) {
    const { payment } = a;
    if (a.status !== 'paid' || !payment) continue;
    if (payment.journalRefId !== undefined || payment.contractId !== undefined) continue;
    const group = groups.get(payment.paymentId);
    if (group) group.members.push(a);
    else
      groups.set(payment.paymentId, {
        amount: payment.amount,
        paidOn: payment.paidOn,
        members: [a],
      });
  }
  return [...groups.entries()].map(([paymentId, { amount, paidOn, members }]) => ({
    paymentId,
    amount,
    paidOn,
    characterIds: new Set(members.map((m) => m.characterId)),
    assignments: members,
  }));
}

/** How far a real transaction's date may drift from the pilot's own recorded paid-on date — slack for ESI's post-lag and the local/EVE calendar gap, not a second guess at when the ISK actually moved. */
const RECORDED_LINK_WINDOW_DAYS = 3;

/**
 * Silently attaches an already-recorded Settle-up payment to the real
 * transaction behind it, once ESI shows one — no confirmation dialog, unlike
 * `suggestLink`. A mining tax lump sum is specific enough (exact ISK, the
 * pilot's own recorded date, one of their own characters) that asking to
 * confirm would be busywork; an *ambiguous* match (more than one plausible
 * transaction) is simply never auto-linked rather than guessed.
 */
export function autoMatchRecordedPayments(
  payments: readonly MadePayment[],
  groups: readonly RecordedPaymentGroup[]
): { group: RecordedPaymentGroup; payment: MadePayment }[] {
  const matches: { group: RecordedPaymentGroup; payment: MadePayment }[] = [];
  for (const group of groups) {
    const candidates = payments.filter(
      (p) =>
        group.characterIds.has(p.characterId) &&
        p.amount !== null &&
        amountsMatch(group.amount, p.amount) &&
        Math.abs(utcDay(p.date) - utcDay(group.paidOn)) <= RECORDED_LINK_WINDOW_DAYS
    );
    if (candidates.length === 1) matches.push({ group, payment: candidates[0] });
  }
  return matches;
}

/**
 * How — if at all — this Payee is identifiable as the payment's recipient.
 *
 * `'entity'` is the real signal: the id this Payee learned from a previous
 * confirmed link. `'name'` is the weaker bootstrap for a Payee that has learned
 * nothing yet, and is deliberately reported as its own kind rather than folded
 * in — a Payee's name is a free-text label ("the moon, the corp, or the person,
 * whichever is memorable") that need not equal any ESI name, so a suggestion
 * built on it must not claim to know who was paid.
 */
function identityKind(payee: PayeeRecord, payment: MadePayment): 'entity' | 'name' | null {
  if (payee.entityId !== undefined && payment.counterpartyId !== undefined) {
    return payee.entityId === payment.counterpartyId ? 'entity' : null;
  }
  if (payment.counterpartyName === undefined) return null;
  return payee.name.trim().toLowerCase() === payment.counterpartyName.trim().toLowerCase()
    ? 'name'
    : null;
}

/**
 * The subset of `members` whose tax adds up to `amount` — the whole in-window
 * balance if that is what was paid, else a single Assignment that matches on
 * its own. Deliberately not a general subset-sum: a pilot pays off a balance or
 * one entry, and an arbitrary "these four of seven happen to add up" match
 * would be a coincidence presented as a finding.
 */
function bestSubset(members: readonly GroupMember[], amount: number | null): GroupMember[] | null {
  if (amount === null || members.length === 0) return null;
  const total = members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  if (amountsMatch(total, amount)) return [...members];
  const single = members.find((m) => amountsMatch(m.assignment.taxOwed, amount));
  return single ? [single] : null;
}

/**
 * The best guess at what one payment paid off, or `null` when nothing plausible
 * lines up — an unmatched payment is simply never offered, which is what keeps
 * the entry point from nagging without a table of waved-away payments.
 *
 * Identity outranks amount: a payment to a Payee we can name is that Payee's
 * even when some *other* Payee's balance happens to equal the figure sent.
 */
export function suggestLink(
  payment: MadePayment,
  balances: readonly PayeeBalance[]
): LinkSuggestion | null {
  const candidates = balances
    .filter((b) => b.payee.characterId === payment.characterId && b.owed > 0)
    .map((b) => ({
      balance: b,
      inWindow: b.members.filter((m) => withinLinkWindow(m.assignment.date, payment.date)),
      identity: identityKind(b.payee, payment),
    }))
    .filter((c) => c.inWindow.length > 0);

  // A learned id beats a name, and either beats a coincidental amount: once
  // *some* Payee is identifiable, no other Payee's balance is considered, however
  // neatly its figure happens to match.
  const byEntity = candidates.filter((c) => c.identity === 'entity');
  const byName = candidates.filter((c) => c.identity === 'name');
  const identified = byEntity.length > 0 ? byEntity : byName;

  if (identified.length > 0) {
    const viaEntity = identified === byEntity;
    for (const c of identified) {
      const members = bestSubset(c.inWindow, payment.amount);
      if (members) {
        return {
          payment,
          balance: c.balance,
          members,
          confidence: viaEntity ? 'identity-and-amount' : 'name-and-amount',
        };
      }
    }
    // No amount agreed, but we know (or think we know) who was paid — which is
    // also the only path a payment in kind, carrying no ISK figure at all, can
    // take.
    const first = identified[0];
    return {
      payment,
      balance: first.balance,
      members: first.inWindow,
      confidence: viaEntity ? 'identity' : 'name',
    };
  }

  // Nobody identifiable: an amount that adds up is the only thing left worth
  // offering. Anything less plausible is never shown at all.
  for (const c of candidates) {
    const members = bestSubset(c.inWindow, payment.amount);
    if (members) return { payment, balance: c.balance, members, confidence: 'amount' };
  }
  return null;
}

/** Every payment worth offering, most confident first, then newest. */
export function suggestLinks(
  payments: readonly MadePayment[],
  balances: readonly PayeeBalance[]
): LinkSuggestion[] {
  const rank: Record<LinkConfidence, number> = {
    'identity-and-amount': 0,
    identity: 1,
    'name-and-amount': 2,
    name: 3,
    amount: 4,
  };
  return payments
    .map((p) => suggestLink(p, balances))
    .filter((s): s is LinkSuggestion => s !== null)
    .sort(
      (a, b) =>
        rank[a.confidence] - rank[b.confidence] || b.payment.date.localeCompare(a.payment.date)
    );
}
