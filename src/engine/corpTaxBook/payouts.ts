import type { BalanceDisplay, FeederPayout } from './feederAccrual';
import type { JournalEntryLike } from './sync';

/**
 * Payouts to a moon owner (feeder): recording one, and attaching the wallet
 * journal's outgoing donation to it later ("paying backwards", like
 * `paymentLinks.ts`). Pure. Mirrored in `functions/src/corpTaxBookEngine.ts`
 * (`functionsMirror.test.ts` keeps the two equal). Payouts never reach Tax
 * Payment matching or Statements: those read incoming donations only.
 */

/** A donation the accounting corporation's wallet sent. */
export interface OutgoingDonation {
  refId: number;
  division: number;
  /** Who received it (the journal's `second_party_id`). */
  recipientId: number;
  /** Whole ISK, positive. */
  amount: number;
  at: string;
  reason?: string;
}

/** How far a recorded date may sit from the journal's day and still be the same payment. */
export const PAYOUT_LINK_WINDOW_DAYS = 3;

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const payoutId = (d: Pick<OutgoingDonation, 'division' | 'refId'>) =>
  `j${d.division}_${d.refId}`;

const dayIndex = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** ISK the corporation's wallet donated to someone else (the amount is negative on the journal). */
export function outgoingDonationsFromJournal(
  entries: readonly (JournalEntryLike & { second_party_id?: number })[],
  division: number,
  corporationId: number
): OutgoingDonation[] {
  const out: OutgoingDonation[] = [];
  for (const e of entries) {
    if (e.ref_type !== 'player_donation') continue;
    if (!(typeof e.amount === 'number' && e.amount < 0)) continue;
    if (e.first_party_id !== corporationId || e.second_party_id === undefined) continue;
    if (!Number.isSafeInteger(e.id) || Number.isNaN(Date.parse(e.date))) continue;
    out.push({
      refId: e.id,
      division,
      recipientId: e.second_party_id,
      amount: Math.round(-e.amount),
      at: new Date(e.date).toISOString(),
      ...(e.reason ? { reason: e.reason } : {}),
    });
  }
  return out;
}

type StoredPayout = FeederPayout & { id: string };

export interface PayoutReconciliation {
  /** Journal entries that are the payment an officer already recorded. */
  attach: { id: string; journalRef: number }[];
  /** Donations nobody recorded: each becomes a payout. */
  create: { id: string; payout: FeederPayout }[];
}

/**
 * Attach each outgoing donation to the recorded payout with the same amount,
 * date (within the window) and recipient; a donation with no such record is
 * recorded as a payout. A journal entry that already counts (attached, or
 * marked "not a payout") is never counted again.
 */
export function reconcileOutgoing(input: {
  payouts: readonly StoredPayout[];
  outgoing: readonly OutgoingDonation[];
  /** The feeder's payee ids; only a donation to one of them counts. */
  payeeIds: ReadonlySet<number>;
  /** First covered day: older donations are never auto-recorded. */
  since: string;
}): PayoutReconciliation {
  const seen = new Set(
    input.payouts.flatMap((p) => (p.journalRef === undefined ? [] : [p.journalRef]))
  );
  const open = input.payouts.filter((p) => p.journalRef === undefined && !p.notAPayout);
  const taken = new Set<string>();
  const attach: PayoutReconciliation['attach'] = [];
  const create: PayoutReconciliation['create'] = [];
  const sorted = [...input.outgoing].sort((a, b) => a.at.localeCompare(b.at) || a.refId - b.refId);
  for (const d of sorted) {
    if (!input.payeeIds.has(d.recipientId) || seen.has(d.refId)) continue;
    seen.add(d.refId);
    const amount = Math.round(d.amount);
    const near = open
      .filter(
        (p) =>
          !taken.has(p.id) &&
          p.amount === amount &&
          Math.abs(dayIndex(p.date) - dayIndex(d.at)) <= PAYOUT_LINK_WINDOW_DAYS
      )
      .sort(
        (a, b) =>
          Math.abs(dayIndex(a.date) - dayIndex(d.at)) -
            Math.abs(dayIndex(b.date) - dayIndex(d.at)) || a.id.localeCompare(b.id)
      )[0];
    if (near) {
      taken.add(near.id);
      attach.push({ id: near.id, journalRef: d.refId });
      continue;
    }
    const date = d.at.slice(0, 10);
    if (date < input.since) continue;
    create.push({
      id: payoutId(d),
      payout: {
        date,
        amount,
        method: 'donation',
        status: 'matched',
        journalRef: d.refId,
        notAPayout: false,
      },
    });
  }
  return { attach, create };
}

/** A payout an officer says they sent ("I've sent it", or added by hand). A contract counts as other. */
export function buildRecordedPayout(input: {
  amount: number;
  date: string;
  method: 'donation' | 'contract' | 'other';
}): FeederPayout {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error('amount must be whole ISK above zero');
  }
  if (!DATE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    throw new Error('date must be a day');
  }
  const method = input.method === 'donation' ? 'donation' : 'other';
  return {
    date: input.date,
    amount: input.amount,
    method,
    status: method === 'donation' ? 'waiting-for-journal' : 'recorded',
    notAPayout: false,
  };
}

/** The balance once `sent` ISK has gone out; credit when it is more than is owed. Whole ISK, rounded down. */
export function balanceAfter(balance: number, sent: number): BalanceDisplay {
  const left = balance - sent;
  const isk = Math.floor(Math.abs(left));
  return { kind: isk === 0 ? 'even' : left > 0 ? 'owed' : 'credit', isk };
}

/**
 * The days a payment covers: after the last payment, up to the last accrued
 * day. When nothing is newer than the last payment, every accrued day.
 */
export function payoutPeriod(
  days: readonly { date: string }[],
  payouts: readonly Pick<FeederPayout, 'date' | 'notAPayout'>[]
): { from: string; to: string } | undefined {
  const dates = days.map((d) => d.date).sort();
  if (dates.length === 0) return undefined;
  const lastPaid = payouts
    .filter((p) => !p.notAPayout)
    .map((p) => p.date)
    .sort()
    .at(-1);
  const to = dates[dates.length - 1] as string;
  const after = lastPaid === undefined ? dates : dates.filter((d) => d > lastPaid);
  return { from: (after[0] ?? dates[0]) as string, to };
}

/** The reason to paste into the in-game transfer. Never the miner rate or margin. */
export function payoutReason(prefix: string, period: { from: string; to: string } | undefined) {
  return period ? `${prefix}, ${period.from} to ${period.to}` : prefix;
}
