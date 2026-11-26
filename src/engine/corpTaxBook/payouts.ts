import type { BalanceDisplay, FeederPayout } from './feederAccrual';
import type { JournalEntryLike } from './sync';
import { DAY_MS } from '@/lib/age';
import { PAYOUT_LINK_WINDOW_DAYS } from '../../../functions/src/corpTaxBookTransferMatch';

export interface OutgoingDonation {
  refId: number;
  division: number;
  recipientId: number;
  amount: number;
  at: string;
  reason?: string;
}

export const PAYOUT_REASON_PREFIX = 'Moon mining payout';

export const carriesPayoutReference = (reason: string | undefined): boolean =>
  reason !== undefined && reason.toLowerCase().includes(PAYOUT_REASON_PREFIX.toLowerCase());

export { PAYOUT_LINK_WINDOW_DAYS };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const payoutId = (d: Pick<OutgoingDonation, 'division' | 'refId'>) =>
  `j${d.division}_${d.refId}`;

export function parsePaymentId(id: string): { division: number; refId: number } | null {
  const m = /^j(\d+)_(\d+)$/.exec(id);
  return m ? { division: Number(m[1]), refId: Number(m[2]) } : null;
}

const dayIndex = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

const OUTGOING_REF_TYPES: ReadonlySet<string> = new Set([
  'player_donation',
  'corporation_account_withdrawal',
]);

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

type StoredPayout = FeederPayout & { id: string; confirmedAt?: number };

export interface PayoutReconciliation {
  attach: { id: string; journalRef: number }[];
  create: { id: string; payout: FeederPayout }[];
}

export type Payee = { kind: 'corporation' | 'character'; id: number };

export const payeeOf = (owner: { corporationId: number; payee?: Payee }): Payee =>
  owner.payee ?? { kind: 'corporation', id: owner.corporationId };

export interface PayeeChange {
  payee: Payee;
  from: number;
}

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

export interface OwnerOutgoing {
  corporationId: number;
  payee?: Payee;
  payeeHistory?: readonly PayeeChange[];
  payouts: readonly StoredPayout[];
  since: string;
}

const dayGap = (date: string, at: string) => Math.abs(dayIndex(date) - dayIndex(at));

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
    const referenced = carriesPayoutReference(d.reason);
    results[i]!.create.push({
      id: payoutId(d),
      payout: {
        date,
        amount,
        method: 'donation',
        status: 'matched',
        journalRef: d.refId,
        notAPayout: !referenced,
        ...(referenced ? {} : { unconfirmed: true }),
      },
    });
  }
  return results;
}

const AUTO_RECORDED = /^j\d+_\d+$/;

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
        (!p.notAPayout || p.unconfirmed === true) &&
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

export function balanceAfter(balance: number, sent: number): BalanceDisplay {
  const left = balance - sent;
  const isk = Math.floor(Math.abs(left));
  return { kind: isk === 0 ? 'even' : left > 0 ? 'owed' : 'credit', isk };
}

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

export function payoutReason(prefix: string, period: { from: string; to: string } | undefined) {
  return period ? `${prefix}, ${period.from} to ${period.to}` : prefix;
}
