/**
 * A Miner's running account (#6294, decision 20261117-033049): every closed day after the
 * book's switch-over is billed as it closes, and the Miner's money pays the oldest unpaid day
 * first, by amount. Statements issued before the switch-over keep their own rules and are paid
 * first (`allocatePayments`); what they leave over flows on to the running days.
 *
 * A day a payment reaches is paid when the money falls short of its tax by no more than the
 * book's tolerance, a percent of the day with no ISK floor; the gap is written off. A day no
 * payment reached stays owed in full. Credit is only money ahead of every billed day.
 *
 * Recomputed from the whole history each time, like `allocatePayments`; a day at or before the
 * stored paid-through stays paid even when money is later taken back (D22), and takes no more
 * money. Days are settled a date at a time: what one date's lines owe together.
 */
import {
  allocatePayments,
  countedPayments,
  paymentNet,
  type Allocation,
  type AllocationInput,
} from './allocation';
import {
  settleDays,
  type AccountInput,
  type DayAmount,
  type DaySettlement,
  type RunningDay,
} from './account';

export {
  DAY_SETTLE_TOLERANCE_PCT,
  daySettleTolerance,
  runningDaysFromLines,
  type DayAmount,
  type DaySettlement,
  type RunningDay,
} from './account';

export interface RunningAccountInput
  extends AllocationInput, Omit<AccountInput, 'payments' | 'startDate' | 'writeOffs'> {}

/**
 * Where one Tax Payment's money went. `statements`, `days` and `credit` add up to the payment's
 * tax (its amount less the part coded "not tax"). Money a tolerance wrote off is no payment's.
 */
export interface PaymentApplication {
  paymentId: string;
  /** The legacy Statements it settled, before any day. */
  statements: { statementId: string; amount: number }[];
  /** The days it paid, oldest first; a payment never pays a held day. */
  days: DayAmount[];
  /** What no Statement or day absorbed of this payment; the account's credit is this plus any left over from corrections. */
  credit: number;
}

/** Who paid each day, by kind of money. Credit corrections and officer write-offs are not payments. */
export interface RunningApplications {
  /** Every counted payment that carried tax, in the order the book applies them (oldest first). */
  payments: PaymentApplication[];
  /** Credit that came from a negative day, a dismissal or a negative Statement. */
  corrections: DayAmount[];
  /** Officer write-offs with no Statement. */
  writeOffs: DayAmount[];
}

export interface RunningAccount {
  /** The Statements issued before the switch-over, as `allocatePayments` settles them. */
  legacy: Allocation;
  byDay: Map<string, DaySettlement>;
  /** The same money as `byDay.credited`, split by where it came from. */
  applications: RunningApplications;
  /** Money ahead of every billed day. */
  credit: number;
  /** Everything billed less everything paid, forgiven or written off; negative is credit. */
  balance: number;
  /**
   * The newest day with nothing owed on or before it (days an open dispute holds neither stop nor
   * advance it), never before the stored one; null while a Statement is unpaid or no day is paid yet.
   */
  paidThrough: string | null;
  /** What is owed now: the amount, how many dates it covers (an unpaid Statement's too), the oldest. */
  owes: { amount: number; days: number; oldest: string } | null;
}

/**
 * The running account with calendar Statements paid first (`allocatePayments`). Production holds
 * no calendar Statement, so this is `buildAccount` (`account.ts`) plus a pass that finds nothing;
 * it goes when the calendar Statement code does.
 */
export function allocateRunningAccount(input: RunningAccountInput): RunningAccount {
  const legacy = allocatePayments(input);
  // Money that is not a payment (negative Statements, dismissals) reaches days without the tolerance.
  const legacyNonPayment = Math.min(
    legacy.credit,
    allocatePayments({ ...input, payments: [] }).credit
  );
  // What each payment has left for the days once the legacy Statements took theirs.
  const toStatements = new Map<string, { statementId: string; amount: number }[]>();
  for (const c of legacy.paymentCredits) {
    const list = toStatements.get(c.paymentId) ?? [];
    list.push({ statementId: c.statementId, amount: c.amount });
    toStatements.set(c.paymentId, list);
  }
  const counted = countedPayments(input.payments, input.startDate).filter((p) => paymentNet(p) > 0);
  const statementsOf = (id: string) => toStatements.get(id) ?? [];
  // What an officer write-off with no Statement left over, after every Statement it could reduce.
  const usedByWriteOff = new Map<string, number>();
  for (const c of legacy.writeOffCredits)
    usedByWriteOff.set(c.writeOffId, (usedByWriteOff.get(c.writeOffId) ?? 0) + c.amount);
  const writeOffPool = (input.officerWriteOffs ?? [])
    .filter((w) => !w.statementId)
    .reduce((sum, w) => sum + Math.max(0, w.amount - (usedByWriteOff.get(w.id) ?? 0)), 0);

  const days = settleDays(input, {
    extraCorrections: legacyNonPayment,
    paymentPool: legacy.credit - legacyNonPayment,
    payments: counted.map((p) => ({
      paymentId: p.id,
      left: paymentNet(p) - statementsOf(p.id).reduce((sum, s) => sum + s.amount, 0),
    })),
    writeOffPool,
  });

  const owedDates = new Set<string>();
  for (const [date, d] of days.byDay) if (!d.settled && !d.held) owedDates.add(date);
  let legacyOwed = 0;
  for (const s of input.statements) {
    const st = legacy.byStatement.get(s.id);
    if (!st || st.settled || st.remaining <= 0) continue;
    legacyOwed += st.remaining;
    const dates = s.lines.filter((l) => l.tax > 0).map((l) => l.date);
    for (const date of dates.length > 0 ? dates : [s.coversFrom]) owedDates.add(date);
  }
  const amount = legacyOwed + (days.owes?.amount ?? 0);
  const oldest = [...owedDates].sort()[0];
  return {
    legacy,
    byDay: days.byDay,
    applications: {
      ...days.applications,
      payments: days.applications.payments.map((p) => ({
        paymentId: p.paymentId,
        statements: statementsOf(p.paymentId),
        days: p.days,
        credit: p.credit,
      })),
    },
    credit: days.credit,
    balance: legacy.balance + days.balance,
    paidThrough: legacyOwed > 0 ? null : days.paidThrough,
    owes: amount > 0 && oldest ? { amount, days: owedDates.size, oldest } : null,
  };
}

/**
 * The newest day that may be stored as paid for good (D22): every day up to it is settled, held
 * by no dispute, before `today`, and priced at a saved close-of-day price. A day with no price
 * has no tax and reads as paid, so storing past one would forgive it; a live price is a guess
 * that moves. Null while a Statement is unpaid or no day qualifies. Only an officer's client can
 * compute it: the server has no prices. The stored day never moves back (`paidThrough` holds it).
 */
export function closableThrough(input: {
  account: Pick<RunningAccount, 'byDay' | 'paidThrough'>;
  /** The Miner's running days with whether every line was priced at a saved close-of-day price. */
  days: readonly (RunningDay & { savedPrices: boolean })[];
  heldDays: ReadonlySet<string>;
  /** The UTC date of the read; ore for it is still coming in. */
  today: string;
}): string | null {
  if (input.account.paidThrough === null) return null;
  let through: string | null = null;
  for (const d of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    const settled = input.account.byDay.get(d.date)?.settled === true;
    if (d.date >= input.today || input.heldDays.has(d.date) || !d.savedPrices || !settled) break;
    through = d.date;
  }
  return through;
}
