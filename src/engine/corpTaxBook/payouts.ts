import type { BalanceDisplay, FeederPayout } from './feederAccrual';
import type { JournalEntryLike } from './sync';
import { DAY_MS } from '@/lib/age';

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const payoutId = (d: Pick<OutgoingDonation, 'division' | 'refId'>) =>
  `j${d.division}_${d.refId}`;

const dayIndex = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/**
 * How the journal records ISK the corporation's wallet gave someone: a corporation wallet's
 * "Give ISK" is a `corporation_account_withdrawal` (first party the corporation).
 */
const OUTGOING_REF_TYPES: ReadonlySet<string> = new Set([
  'player_donation',
  'corporation_account_withdrawal',
]);

/** ISK the corporation's wallet donated to someone else (the amount is negative on the journal). */
export function outgoingDonationsFromJournal(
  entries: readonly (JournalEntryLike & { second_party_id?: number })[],
  division: number,
  corporationId: number
): OutgoingDonation[] {
  const out: OutgoingDonation[] = [];
  for (const e of entries) {
    if (!OUTGOING_REF_TYPES.has(e.ref_type)) continue;
    if (!(typeof e.amount === 'number' && e.amount < 0)) continue;
    if (e.first_party_id !== corporationId || e.second_party_id === undefined) continue;
    // A move between the corporation's own divisions pays nobody.
    if (e.second_party_id === corporationId) continue;
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

/** `confirmedAt`: an officer's own record was folded into this journal row (#4617). */
type StoredPayout = FeederPayout & { id: string; confirmedAt?: number };

export interface PayoutReconciliation {
  /** Journal entries that are the payment an officer already recorded. */
  attach: { id: string; journalRef: number }[];
  /** Donations nobody recorded: each becomes a payout. */
  create: { id: string; payout: FeederPayout }[];
}

export type Payee = { kind: 'corporation' | 'character'; id: number };

/** Who a payment to a moon owner goes to: its payee, else the moon owner corporation itself. */
export const payeeOf = (owner: { corporationId: number; payee?: Payee }): Payee =>
  owner.payee ?? { kind: 'corporation', id: owner.corporationId };

/** One payee and when it took over (ms). `from: 0` is a payee set before history was kept. */
export interface PayeeChange {
  payee: Payee;
  from: number;
}

/**
 * Who a donation sent at `at` may go to for this moon owner: the payee in force then, and the
 * moon owner corporation itself. A record with no history falls back to its current payee.
 */
export function payeeIdsAt(
  owner: { corporationId: number; payee?: Payee; payeeHistory?: readonly PayeeChange[] },
  at: string
): Set<number> {
  const ids = new Set([owner.corporationId]);
  const history = owner.payeeHistory;
  if (!history || history.length === 0) {
    if (owner.payee) ids.add(owner.payee.id);
    return ids;
  }
  const t = Date.parse(at);
  const inForce = history.filter((h) => h.from <= t).at(-1);
  if (inForce) ids.add(inForce.payee.id);
  return ids;
}

/** The payee history after setting `payee` at `now`; seeds it from a record that had none. */
export function withPayeeChange(
  rec: { payee?: Payee; payeeChangedAt?: number; payeeHistory?: readonly PayeeChange[] },
  payee: Payee,
  now: number
): PayeeChange[] {
  const history: PayeeChange[] = rec.payeeHistory
    ? [...rec.payeeHistory]
    : rec.payee
      ? [{ payee: rec.payee, from: rec.payeeChangedAt ?? 0 }]
      : [];
  const last = history.at(-1)?.payee;
  if (last?.kind === payee.kind && last.id === payee.id) return history;
  return [...history, { payee, from: now }];
}

/** One moon owner's side of the book-wide reconcile. */
export interface OwnerOutgoing {
  corporationId: number;
  payee?: Payee;
  payeeHistory?: readonly PayeeChange[];
  payouts: readonly StoredPayout[];
  /** First covered day: older donations are never auto-recorded. */
  since: string;
}

const dayGap = (date: string, at: string) => Math.abs(dayIndex(date) - dayIndex(at));

/**
 * Attach each outgoing donation to the recorded payout with the same amount, date (within the
 * window) and recipient; a donation with no such record is recorded as a payout. One pass over
 * the whole book: a journal entry counts once across every moon owner, and a donation whose
 * recipient is the payee of more than one moon owner is never auto-recorded (an officer adds it
 * by hand). Only a donation payout takes a journal donation.
 */
export function reconcileBookOutgoing(input: {
  owners: readonly OwnerOutgoing[];
  outgoing: readonly OutgoingDonation[];
}): (PayoutReconciliation & { corporationId: number })[] {
  const results = input.owners.map((o) => ({
    corporationId: o.corporationId,
    attach: [] as PayoutReconciliation['attach'],
    create: [] as PayoutReconciliation['create'],
  }));
  const seen = new Set(
    input.owners.flatMap((o) =>
      o.payouts.flatMap((p) => (p.journalRef === undefined ? [] : [p.journalRef]))
    )
  );
  const open = input.owners.map((o) =>
    o.payouts.filter((p) => p.journalRef === undefined && !p.notAPayout && p.method === 'donation')
  );
  const taken = new Set<string>();
  const sorted = [...input.outgoing].sort((a, b) => a.at.localeCompare(b.at) || a.refId - b.refId);
  for (const d of sorted) {
    if (seen.has(d.refId)) continue;
    const owners = input.owners.flatMap((o, i) =>
      payeeIdsAt(o, d.at).has(d.recipientId) ? [i] : []
    );
    if (owners.length === 0) continue;
    seen.add(d.refId);
    const amount = Math.round(d.amount);
    const near = owners
      .flatMap((i) =>
        (open[i] ?? []).map((p) => ({ i, p, key: `${input.owners[i]!.corporationId}:${p.id}` }))
      )
      .filter(
        ({ p, key }) =>
          !taken.has(key) && p.amount === amount && dayGap(p.date, d.at) <= PAYOUT_LINK_WINDOW_DAYS
      )
      .sort(
        (a, b) =>
          dayGap(a.p.date, d.at) - dayGap(b.p.date, d.at) ||
          input.owners[a.i]!.corporationId - input.owners[b.i]!.corporationId ||
          a.p.id.localeCompare(b.p.id)
      )[0];
    if (near) {
      taken.add(near.key);
      results[near.i]!.attach.push({ id: near.p.id, journalRef: d.refId });
      continue;
    }
    if (owners.length > 1) continue;
    const i = owners[0]!;
    const date = d.at.slice(0, 10);
    if (date < input.owners[i]!.since) continue;
    results[i]!.create.push({
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
  return results;
}

const AUTO_RECORDED = /^j\d+_\d+$/;

/**
 * "I've sent it" or a manual add after the journal already auto-recorded the same payment: the
 * journal row with the same amount within the matching window, which the officer's record then
 * confirms instead of counting it twice. Only a donation, and only a row not yet confirmed.
 */
export function payoutToMerge(
  stored: readonly StoredPayout[],
  recorded: { amount: number; date: string; method: 'donation' | 'contract' | 'other' }
): string | undefined {
  if (recorded.method !== 'donation') return undefined;
  return stored
    .filter(
      (p) =>
        AUTO_RECORDED.test(p.id) &&
        p.journalRef !== undefined &&
        !p.notAPayout &&
        p.confirmedAt === undefined &&
        p.method === 'donation' &&
        p.amount === recorded.amount &&
        dayGap(p.date, recorded.date) <= PAYOUT_LINK_WINDOW_DAYS
    )
    .sort(
      (a, b) =>
        dayGap(a.date, recorded.date) - dayGap(b.date, recorded.date) || a.id.localeCompare(b.id)
    )[0]?.id;
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
