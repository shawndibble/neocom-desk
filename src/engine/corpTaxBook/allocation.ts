/**
 * Tax Payments against Statements, at Miner level (D5/D15, D18, D26). Every
 * donation from any of a Miner's characters credits that Miner, oldest
 * Statement first; a payment code pins a donation to one Statement; an
 * unknown character with no code goes to Unmatched. Overpaying or prepaying
 * becomes credit. An officer can mark all or part of a donation "not tax",
 * which reopens that much debt. A Statement paid within max(0.5%, 100k ISK)
 * settles, and the shortfall is written off and logged.
 *
 * Recomputed from the whole history each time, so marking "not tax" or
 * reversing a dismissal simply reflows the credit.
 *
 * An officer's write-off (#4637) applies after every payment, in the order
 * they were recorded: one with a Statement reduces that Statement, one without
 * reduces open Statements oldest first. What it finds nothing left to forgive
 * is dropped, never credit, so it never moves a payment off what it paid.
 */
import { activeDismissalFor, type DismissableCharge, type Dismissal } from './dismissals';
import { minerIdFor, type Miner } from './charges';
import type { Statement } from './statements';

export const SETTLE_TOLERANCE_PCT = 0.5;
export const SETTLE_TOLERANCE_MIN_ISK = 100_000;

/** How short of a Statement's amount a payment may fall and still settle it. */
export function settleTolerance(amount: number): number {
  return Math.max((amount * SETTLE_TOLERANCE_PCT) / 100, SETTLE_TOLERANCE_MIN_ISK);
}

/** One Tax Payment credited to a Miner. */
export interface TaxPayment {
  id: string;
  minerId: string;
  /** The character that sent it. */
  characterId: number;
  amount: number;
  at: string;
  /** A `player_donation` found in the wallet journal, or one an officer recorded by hand. */
  source: 'donation' | 'manual';
  /** The Statement its code pinned it to. */
  statementId?: string;
  /** How much of it an officer marked "not tax". */
  notTaxAmount?: number;
}

/** A dismissal of a day already on a Statement, credited to that Statement. */
export interface DismissalCredit {
  statementId: string;
  dismissalId: string;
  chargeKey: string;
  amount: number;
}

/** The credits that active dismissals give days already billed — a Statement itself never changes. */
export function dismissalCredits(
  statements: readonly Statement[],
  dismissals: readonly Dismissal[],
  charges: readonly DismissableCharge[]
): DismissalCredit[] {
  const byKey = new Map(charges.map((c) => [c.key, c]));
  const credits: DismissalCredit[] = [];
  for (const s of statements) {
    for (const line of s.lines) {
      const charge = line.chargeKey ? byKey.get(line.chargeKey) : undefined;
      if (!charge) continue;
      const dismissal = activeDismissalFor(charge, dismissals);
      if (dismissal) {
        credits.push({
          statementId: s.id,
          dismissalId: dismissal.id,
          chargeKey: charge.key,
          amount: line.tax,
        });
      }
    }
  }
  return credits;
}

/** A write-off an officer recorded (`writeOffs`): the corporation forgave part of what a Miner owes. */
export interface OfficerWriteOff {
  id: string;
  amount: number;
  /** ISO instant it was recorded. */
  at: string;
  /** The Statement it reduces; none reduces open Statements oldest first. */
  statementId?: string;
}

/** A `writeOffs` doc as the book stores it: whose debt, and the officer's reason. */
export interface RecordedWriteOff extends OfficerWriteOff {
  minerId: string;
  reason: string;
}

/** The part of one officer write-off that reduced one Statement. */
export interface WriteOffCredit {
  writeOffId: string;
  statementId: string;
  amount: number;
}

export interface StatementSettlement {
  amount: number;
  /** Payments, dismissals and officer write-offs credited to it. */
  credited: number;
  /** What officer write-offs forgave of it (part of `credited`). */
  forgiven: number;
  /** The shortfall the tolerance wrote off. */
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

/** The part of one Tax Payment that was credited to one Statement. */
export interface PaymentCredit {
  paymentId: string;
  statementId: string;
  amount: number;
}

export interface Allocation {
  byStatement: Map<string, StatementSettlement>;
  /** Tolerance write-offs, to log. */
  writeOffs: { statementId: string; amount: number }[];
  /** Which Statement each Tax Payment's money went to, one entry per payment and Statement. */
  paymentCredits: PaymentCredit[];
  /** Which Statement each officer write-off reduced. */
  writeOffCredits: WriteOffCredit[];
  /** Payment nothing absorbed — printed on the next Statement. */
  credit: number;
  /** Statements − payments − dismissals − write-offs (tolerance and officer); negative is credit. */
  balance: number;
}

/** Whether a donation's UTC timestamp falls before the book's start date (a donation on the start date counts). */
export function isBeforeBook(at: string, startDate: string): boolean {
  return at.slice(0, 10) < startDate;
}

export interface AllocationInput {
  /** One Miner's issued Statements. */
  statements: readonly Statement[];
  /** That Miner's Tax Payments. */
  payments: readonly TaxPayment[];
  dismissalCredits: readonly DismissalCredit[];
  /** That Miner's officer write-offs. */
  officerWriteOffs?: readonly OfficerWriteOff[];
  /** The book's start date: a donation dated before it credits nothing. Hand-recorded payments always count. */
  startDate?: string;
}

export function allocatePayments(rawInput: AllocationInput): Allocation {
  const { startDate } = rawInput;
  const input = {
    ...rawInput,
    payments: startDate
      ? rawInput.payments.filter((p) => p.source !== 'donation' || !isBeforeBook(p.at, startDate))
      : rawInput.payments,
  };
  const ordered = [...input.statements].sort(
    (a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id)
  );
  type Running = { amount: number; credited: number; paidIn: number; forgiven: number };
  const state = new Map<string, Running>(
    ordered.map((s) => [s.id, { amount: s.amount, credited: 0, paidIn: 0, forgiven: 0 }])
  );
  // Only a payment settles within the tolerance; a dismissal must cover in full.
  const isDone = (st: Running): boolean => {
    const remaining = st.amount - st.credited;
    return remaining <= 0 || (st.paidIn > 0 && remaining <= settleTolerance(st.amount));
  };
  const apply = (id: string, available: number, isPayment: boolean): number => {
    const st = state.get(id);
    if (!st || isDone(st)) return available;
    const take = Math.min(available, st.amount - st.credited);
    st.credited += take;
    if (isPayment) st.paidIn += take;
    return available - take;
  };
  const applyOldestFirst = (available: number, isPayment: boolean): number => {
    for (const s of ordered) {
      if (available <= 0) break;
      available = apply(s.id, available, isPayment);
    }
    return available;
  };

  // A Statement that came out negative (mostly credit corrections) is credit.
  let credit = ordered.reduce((sum, s) => sum + Math.max(0, -s.amount), 0);
  let paid = 0;
  let dismissed = 0;
  for (const d of input.dismissalCredits) {
    dismissed += d.amount;
    credit += applyOldestFirst(apply(d.statementId, d.amount, false), false);
  }
  const payments = [...input.payments].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  );
  const paymentCredits: PaymentCredit[] = [];
  for (const p of payments) {
    const net = p.amount - Math.min(p.notTaxAmount ?? 0, p.amount);
    let available = net;
    paid += available;
    const before = new Map([...state].map(([id, st]) => [id, st.credited]));
    if (p.statementId) available = apply(p.statementId, available, true);
    credit += applyOldestFirst(available, true);
    for (const [id, st] of state) {
      const amount = st.credited - (before.get(id) ?? 0);
      if (amount > 0) paymentCredits.push({ paymentId: p.id, statementId: id, amount });
    }
  }

  // Officer write-offs, after every payment; a leftover is dropped, never credit.
  const writeOffCredits: WriteOffCredit[] = [];
  let forgivenTotal = 0;
  const officerWriteOffs = [...(input.officerWriteOffs ?? [])].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  );
  for (const w of officerWriteOffs) {
    const targets = w.statementId ? ordered.filter((s) => s.id === w.statementId) : ordered;
    let available = w.amount;
    for (const s of targets) {
      if (available <= 0) break;
      const left = apply(s.id, available, false);
      const amount = available - left;
      available = left;
      if (amount <= 0) continue;
      state.get(s.id)!.forgiven += amount;
      forgivenTotal += amount;
      writeOffCredits.push({ writeOffId: w.id, statementId: s.id, amount });
    }
  }

  const byStatement = new Map<string, StatementSettlement>();
  const writeOffs: Allocation['writeOffs'] = [];
  let billed = 0;
  let writtenOffTotal = 0;
  for (const s of ordered) {
    const st = state.get(s.id)!;
    billed += st.amount;
    const settled = isDone(st);
    const shortfall = Math.max(0, st.amount - st.credited);
    const writtenOff = settled ? shortfall : 0;
    if (writtenOff > 0) writeOffs.push({ statementId: s.id, amount: writtenOff });
    writtenOffTotal += writtenOff;
    byStatement.set(s.id, {
      amount: st.amount,
      credited: st.credited,
      forgiven: st.forgiven,
      writtenOff,
      remaining: shortfall - writtenOff,
      settled,
    });
  }
  return {
    byStatement,
    writeOffs,
    paymentCredits,
    writeOffCredits,
    credit,
    balance: billed - paid - dismissed - writtenOffTotal - forgivenTotal,
  };
}

export type DonationMatch =
  | { kind: 'statement'; statementId: string; minerId: string }
  | { kind: 'miner'; minerId: string }
  | { kind: 'unmatched' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function carriesCode(reason: string, code: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(code)}($|[^a-z0-9])`, 'i').test(reason);
}

/**
 * Whom a donation into the book's division(s) credits. A code in the reason
 * wins, from any character, without revealing any grouping; then a character
 * the book knows — grouped into a Miner, or one that mined at its refineries;
 * anyone else is Unmatched, to be claimed or assigned.
 */
export function matchDonation(
  donation: { characterId: number; reason: string | undefined },
  book: {
    miners: readonly Miner[];
    statements: readonly Statement[];
    /** Characters seen in the book's observer rows. */
    knownCharacterIds: ReadonlySet<number>;
  }
): DonationMatch {
  const reason = donation.reason ?? '';
  if (reason) {
    const pinned = book.statements.find((s) => carriesCode(reason, s.code));
    if (pinned) return { kind: 'statement', statementId: pinned.id, minerId: pinned.minerId };
  }
  const grouped = book.miners.some((m) => m.characterIds.includes(donation.characterId));
  if (grouped || book.knownCharacterIds.has(donation.characterId)) {
    return { kind: 'miner', minerId: minerIdFor(donation.characterId, book.miners) };
  }
  return { kind: 'unmatched' };
}
