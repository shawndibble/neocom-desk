import {
  lateNoticeStanding,
  type LateNoticeLine,
  type LateNoticeStanding,
} from '../../../functions/src/corpTaxBookLateNotice';
import type {
  CheckpointOwedDay,
  RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
import { countedPayments, netPayment, type TaxPayment } from './payments';
import type { OwedDay } from '../../../functions/src/corpTaxBookRunningAccounts';
import { shiftUtcDate, utcDayOf } from '@/engine/localDay';
import { daySettleTolerance } from '../../../functions/src/corpTaxBookKinds';

export const RESIDUE_ISK = 0.5;

export const DAY_SETTLE_TOLERANCE_PCT = 0.5;

export { daySettleTolerance };

export interface RunningDay {
  date: string;
  tax: number;
  charge?: number;
  paidBefore?: number;
  savedPrice?: boolean;
}

export interface DaySettlement {
  tax: number;
  held: boolean;
  credited: number;
  forgiven: number;
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

export interface ToleranceCloseOutDay {
  billed: number;
  paid: number;
  writtenOff: number;
  limit: number;
  exempt?: true;
}

export interface DayAmount {
  date: string;
  amount: number;
}

export interface RunningAccountWriteOff {
  id: string;
  amount: number;
  at: string;
}

export interface MinerRunningAccountInput {
  days: readonly RunningDay[];
  payments: readonly TaxPayment[];
  writeOffs?: readonly RunningAccountWriteOff[];
  startDate?: string;
  heldDays?: ReadonlySet<string>;
  disputeWaivers?: ReadonlyMap<string, number>;
  storedPaidThrough?: string;
  dayTolerancePct?: number;
  toleranceExemptions?: ReadonlyMap<string, number>;
  checkpoint?: RunningAccountCheckpoint;
}

function owedDayOf(d: CheckpointOwedDay): RunningDay {
  const whole = d.tax !== undefined && d.tax >= d.remaining;
  return {
    date: d.date,
    tax: whole ? d.tax! : d.remaining,
    ...(d.charge ? { charge: d.charge } : {}),
    ...(whole && d.tax! > d.remaining ? { paidBefore: d.tax! - d.remaining } : {}),
  };
}

const OPENING_CREDIT = '\u0000checkpoint';

export interface RunningAccountPayment {
  paymentId: string;
  days: DayAmount[];
  credit: number;
}

export interface RunningAccountApplications {
  payments: RunningAccountPayment[];
  corrections: DayAmount[];
  writeOffs: DayAmount[];
}

export interface RunningAccountOwes {
  amount: number;
  days: number;
  oldest: string;
}

export class MinerRunningAccount {
  private constructor(
    readonly input: MinerRunningAccountInput,
    readonly byDay: ReadonlyMap<string, DaySettlement>,
    readonly applications: RunningAccountApplications,
    readonly credit: number,
    readonly balance: number,
    readonly paidThrough: string | null,
    readonly owes: RunningAccountOwes | null,
    readonly toleranceCloseOuts: ReadonlyMap<string, ToleranceCloseOutDay>
  ) {}

  static build(input: MinerRunningAccountInput): MinerRunningAccount {
    const cp = input.checkpoint;
    const after = (date: string) => cp === undefined || date > cp.through;
    const counted = countedPayments(input.payments, input.startDate).filter((p) =>
      after(utcDayOf(p.at))
    );
    const paid = counted.reduce((sum, p) => sum + netPayment(p), 0);
    const opening = Math.max(0, cp?.credit ?? 0);
    const heldDays = new Set(
      [...(input.heldDays ?? [])].filter(
        (date) => after(date) || cp?.owed.some((d) => d.held && d.date === date)
      )
    );
    const waivers = (cp?.owed ?? []).flatMap((d): RunningDay[] => {
      const waived = d.held ? Math.min(input.disputeWaivers?.get(d.date) ?? 0, d.remaining) : 0;
      return waived > 0 ? [{ date: d.date, tax: -waived }] : [];
    });
    const days: RunningDay[] = [
      ...(cp?.owed ?? []).map((d: CheckpointOwedDay) => owedDayOf(d)),
      ...waivers,
      ...input.days.filter((d) => after(d.date)),
    ];
    const settled = settleDays(
      { ...input, heldDays, days },
      {
        paymentPool: opening + paid,
        payments: [
          ...(opening > 0 ? [{ paymentId: OPENING_CREDIT, left: opening }] : []),
          ...counted
            .filter((p) => netPayment(p) > 0)
            .map((p) => ({ paymentId: p.id, left: netPayment(p) })),
        ],
        writeOffPool: (input.writeOffs ?? [])
          .filter((w) => after(utcDayOf(w.at)))
          .reduce((sum, w) => sum + Math.max(0, w.amount), 0),
      }
    );
    const closed =
      cp !== undefined &&
      (cp.paidThrough !== null || cp.owed.length > 0) &&
      cp.owed.every((d) => {
        const day = settled.byDay.get(d.date);
        return !day || day.settled || day.held;
      });
    const reopened = cp?.owed.find((d) => {
      const day = d.held ? settled.byDay.get(d.date) : undefined;
      return day !== undefined && !day.settled && !day.held;
    })?.date;
    const stored = closed ? cp.through : (cp?.paidThrough ?? null);
    const floor =
      reopened !== undefined && stored !== null && stored >= reopened
        ? shiftUtcDate(reopened, -1)
        : stored;
    const paidThrough =
      floor !== null && (settled.paidThrough === null || settled.paidThrough < floor)
        ? floor
        : settled.paidThrough;
    return new MinerRunningAccount(
      input,
      settled.byDay,
      {
        ...settled.applications,
        payments: settled.applications.payments.filter((p) => p.paymentId !== OPENING_CREDIT),
      },
      settled.credit,
      settled.balanceBeforePayments - opening - paid,
      paidThrough,
      settled.owes,
      settled.toleranceCloseOuts
    );
  }

  static checkpoint(
    input: MinerRunningAccountInput,
    minerId: string,
    through: string,
    recorded: { at: string; by?: number; characterIds?: readonly number[] }
  ): RunningAccountCheckpoint {
    const upTo = (date: string) => date <= through;
    const days = input.days.filter((d) => upTo(d.date));
    const account = MinerRunningAccount.build({
      ...input,
      days,
      payments: input.payments.filter((p) => upTo(utcDayOf(p.at))),
      ...(input.writeOffs
        ? { writeOffs: input.writeOffs.filter((w) => upTo(utcDayOf(w.at))) }
        : {}),
    });
    const charges = new Map(
      runningDaysFromLines([
        ...(input.checkpoint?.owed ?? []).map((d: CheckpointOwedDay) => owedDayOf(d)),
        ...days,
      ]).map((d) => [d.date, d.charge ?? 0])
    );
    const owed = [...account.byDay]
      .filter(([, d]) => !d.settled)
      .map(([date, d]): CheckpointOwedDay => {
        const charge = Math.min(charges.get(date) ?? 0, d.remaining);
        return {
          date,
          remaining: d.remaining,
          ...(charge > 0 ? { charge } : {}),
          tax: d.tax,
          credited: d.credited,
          ...(d.writtenOff > 0 ? { writtenOff: d.writtenOff } : {}),
          ...(d.held ? { held: true } : {}),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const billed = account.byDay.size > 0 || input.checkpoint !== undefined;
    const first = owed.find((d) => !d.held && d.remaining - (d.charge ?? 0) >= 1)?.date;
    const capped =
      first !== undefined && account.paidThrough !== null && account.paidThrough >= first
        ? shiftUtcDate(first, -1)
        : account.paidThrough;
    return {
      minerId,
      through,
      owed,
      credit: account.credit,
      balance: account.balance,
      paidThrough: billed && first === undefined ? through : capped,
      ...(recorded.characterIds ? { characterIds: [...recorded.characterIds] } : {}),
      at: recorded.at,
      ...(recorded.by !== undefined ? { by: recorded.by } : {}),
    };
  }

  day(date: string): DaySettlement | undefined {
    return this.byDay.get(date);
  }

  owedDays(): OwedDay[] {
    return [...this.byDay]
      .filter(([, d]) => !d.settled && !d.held && Math.round(d.remaining) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, owed: Math.round(d.remaining), tax: Math.round(d.tax) }));
  }

  heldDates(): string[] {
    return [...this.byDay]
      .filter(([, d]) => d.held)
      .map(([date]) => date)
      .sort();
  }

  writtenOffDays(
    payments: readonly { id: string; at: string }[]
  ): { date: string; amount: number; at: string; paymentId?: string }[] {
    const paidAt = new Map(payments.map((p) => [p.id, p.at]));
    const closedBy = new Map<string, { id: string; at: string }>();
    for (const p of this.applications.payments) {
      const at = paidAt.get(p.paymentId);
      if (at) for (const d of p.days) closedBy.set(d.date, { id: p.paymentId, at });
    }
    return [...this.byDay]
      .filter(([, d]) => d.writtenOff >= 1)
      .map(([date, d]) => {
        const closed = closedBy.get(date);
        return {
          date,
          amount: d.writtenOff,
          at: closed?.at ?? date,
          ...(closed ? { paymentId: closed.id } : {}),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  writeOffDays(): Map<string, DayAmount[]> {
    const cp = this.input.checkpoint;
    const forgiven = this.applications.writeOffs.map((d) => ({ ...d }));
    const out = new Map<string, DayAmount[]>();
    let head = 0;
    const counted = (this.input.writeOffs ?? [])
      .filter((w) => cp === undefined || utcDayOf(w.at) > cp.through)
      .sort((a, b) => a.at.localeCompare(b.at));
    for (const w of counted) {
      const days: DayAmount[] = [];
      let left = Math.max(0, w.amount);
      while (left > 0 && head < forgiven.length) {
        const day = forgiven[head]!;
        const take = Math.min(left, day.amount);
        days.push({ date: day.date, amount: take });
        day.amount -= take;
        left -= take;
        if (day.amount <= 0) head += 1;
      }
      out.set(w.id, days);
    }
    return out;
  }

  owedDates(): string[] {
    return [...this.byDay]
      .filter(([, d]) => !d.settled && !d.held)
      .map(([date]) => date)
      .sort();
  }

  standingOf(notice: {
    lines: readonly Pick<LateNoticeLine, 'date' | 'tax'>[];
  }): LateNoticeStanding {
    return lateNoticeStanding(notice, this.byDay);
  }

  owedOf(date: string, tax: number): number {
    const day = this.byDay.get(date);
    if (!day || day.held || day.tax <= 0 || tax <= 0) return 0;
    const charging = this.input.days
      .filter((d) => d.date === date)
      .reduce((sum, d) => sum + Math.max(0, d.tax), 0);
    const gross = Math.max(charging, day.tax);
    return (day.remaining * tax) / gross;
  }

  closableThrough(today: string): string | null {
    if (this.paidThrough === null) return null;
    const closed = this.input.checkpoint?.through;
    const byDate = new Map<string, boolean>(
      (this.input.checkpoint?.owed ?? []).map((d) => [d.date, true])
    );
    for (const l of this.input.days)
      byDate.set(l.date, (byDate.get(l.date) ?? true) && l.savedPrice !== false);
    const days = [...byDate].map(([date, savedPrices]) => ({ date, savedPrices }));
    let through: string | null = null;
    for (const d of days.sort((a, b) => a.date.localeCompare(b.date))) {
      const day = this.byDay.get(d.date);
      if (!day && closed !== undefined && d.date <= closed) {
        through = d.date;
        continue;
      }
      if (d.date >= today || !d.savedPrices || !day || day.held || !day.settled) break;
      through = d.date;
    }
    return through;
  }
}

export function runningDaysFromLines(
  lines: readonly {
    date: string;
    tax: number;
    kind?: string;
    charge?: number;
    paidBefore?: number;
  }[]
): RunningDay[] {
  const byDate = new Map<string, { tax: number; charge: number; paidBefore: number }>();
  for (const l of lines) {
    const held = byDate.get(l.date) ?? { tax: 0, charge: 0, paidBefore: 0 };
    held.tax += l.tax;
    held.charge += l.charge ?? (l.kind === 'correction' && l.tax > 0 ? l.tax : 0);
    held.paidBefore += l.paidBefore ?? 0;
    byDate.set(l.date, held);
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      tax: v.tax,
      ...(v.charge > 0 ? { charge: v.charge } : {}),
      ...(v.paidBefore > 0 ? { paidBefore: v.paidBefore } : {}),
    }));
}

interface DayPools {
  paymentPool: number;
  payments: readonly { paymentId: string; left: number }[];
  writeOffPool: number;
}

type DaysInput = Pick<
  MinerRunningAccountInput,
  'days' | 'heldDays' | 'storedPaidThrough' | 'dayTolerancePct' | 'toleranceExemptions'
>;

interface SettledDays {
  byDay: Map<string, DaySettlement>;
  applications: RunningAccountApplications;
  credit: number;
  balanceBeforePayments: number;
  paidThrough: string | null;
  owes: RunningAccountOwes | null;
  toleranceCloseOuts: Map<string, ToleranceCloseOutDay>;
}

type Running = {
  tax: number;
  charge: number;
  credited: number;
  paidIn: number;
  forgiven: number;
  pinned: boolean;
  before: number;
  exempt?: number;
};

function settleDays(input: DaysInput, pools: DayPools): SettledDays {
  const pct = input.dayTolerancePct ?? DAY_SETTLE_TOLERANCE_PCT;
  const held = input.heldDays ?? new Set<string>();
  const stored = input.storedPaidThrough;
  const days = runningDaysFromLines(input.days);
  const state = new Map<string, Running>(
    days.map((d) => [
      d.date,
      {
        tax: d.tax,
        charge: d.charge ?? 0,
        credited: d.paidBefore ?? 0,
        paidIn: d.paidBefore ?? 0,
        before: d.paidBefore ?? 0,
        forgiven: 0,
        pinned: stored !== undefined && d.date <= stored,
        ...(input.toleranceExemptions?.has(d.date)
          ? { exempt: input.toleranceExemptions.get(d.date)! }
          : {}),
      },
    ])
  );
  const isHeld = (d: RunningDay) =>
    held.has(d.date) && d.tax > 0 && !(stored !== undefined && d.date <= stored);
  const limitOf = (st: Running) =>
    st.exempt ?? daySettleTolerance(Math.max(0, st.tax - Math.max(0, st.charge)), pct);
  const isDone = (st: Running) => {
    const remaining = st.tax - st.credited;
    if (remaining < RESIDUE_ISK) return true;
    if (st.paidIn <= 0) return false;
    const mined = Math.max(0, st.tax - Math.max(0, st.charge));
    const minedLeft = Math.max(0, mined - st.credited);
    return remaining - minedLeft < RESIDUE_ISK && minedLeft <= limitOf(st);
  };
  const toleranceCloseOuts = new Map<string, ToleranceCloseOutDay>();
  const queue = pools.payments.map((p) => ({
    paymentId: p.paymentId,
    days: [] as DayAmount[],
    left: p.left,
  }));
  let head = 0;
  const attribute = (date: string, amount: number) => {
    while (amount > 0 && head < queue.length) {
      const q = queue[head]!;
      const slice = Math.min(amount, q.left);
      if (slice > 0) q.days.push({ date, amount: slice });
      q.left -= slice;
      amount -= slice;
      if (q.left <= 0) head += 1;
    }
  };
  const corrected: DayAmount[] = [];
  const forgivenDays: DayAmount[] = [];
  const pay = (available: number, kind: 'payment' | 'correction' | 'writeOff'): number => {
    for (const d of days) {
      if (available <= 0) break;
      const st = state.get(d.date)!;
      if (isHeld(d) || st.tax <= 0 || isDone(st)) continue;
      const take = Math.min(available, st.tax - st.credited);
      st.credited += take;
      if (kind === 'payment') {
        st.paidIn += take;
        attribute(d.date, take);
      } else if (kind === 'writeOff') {
        st.forgiven += take;
        forgivenDays.push({ date: d.date, amount: take });
      } else {
        corrected.push({ date: d.date, amount: take });
      }
      available -= take;
    }
    return available;
  };

  const corrections = days.reduce((sum, d) => sum + Math.max(0, -d.tax), 0);
  let credit = pay(corrections, 'correction');
  credit += pay(pools.paymentPool, 'payment');
  pay(pools.writeOffPool, 'writeOff');

  const byDay = new Map<string, DaySettlement>();
  let billed = 0;
  let forgivenTotal = 0;
  let writtenOffTotal = 0;
  let owedAmount = 0;
  const owedDates = new Set<string>();
  let paidThrough: string | null = stored ?? null;
  let gap = false;
  let chargePool = 0;
  for (const st of state.values())
    if (st.pinned) chargePool += Math.min(st.charge, Math.max(0, st.tax));
  for (const d of days) {
    const st = state.get(d.date)!;
    const dayHeld = isHeld(d);
    const pinned = st.pinned;
    const shortfall = Math.max(0, st.tax - st.credited);
    const chargeOwed = pinned && !dayHeld && !isDone(st) ? Math.min(chargePool, shortfall) : 0;
    chargePool -= chargeOwed;
    const settled = st.tax <= 0 || (pinned && chargeOwed <= 0) || (!dayHeld && isDone(st));
    let writtenOff = settled ? shortfall : pinned ? shortfall - chargeOwed : 0;
    if (!settled && !dayHeld && st.paidIn > 0 && st.exempt)
      writtenOff = Math.max(writtenOff, Math.min(st.exempt, shortfall - chargeOwed));
    const remaining = shortfall - writtenOff;
    if (!pinned && !dayHeld && st.paidIn > 0 && settled && writtenOff >= RESIDUE_ISK)
      toleranceCloseOuts.set(d.date, {
        billed: st.tax,
        paid: st.paidIn,
        writtenOff,
        limit: limitOf(st),
        ...(st.exempt !== undefined ? { exempt: true as const } : {}),
      });
    if (!dayHeld) billed += Math.max(0, st.tax) - st.before;
    forgivenTotal += st.forgiven;
    writtenOffTotal += writtenOff;
    if (!settled && !dayHeld) {
      owedAmount += remaining;
      owedDates.add(d.date);
      gap = true;
    }
    if (!gap && settled && (!paidThrough || d.date > paidThrough)) paidThrough = d.date;
    byDay.set(d.date, {
      tax: st.tax,
      held: dayHeld,
      credited: st.credited,
      forgiven: st.forgiven,
      writtenOff,
      remaining,
      settled,
    });
  }

  const oldest = [...owedDates].sort()[0];
  return {
    byDay,
    applications: {
      payments: queue.map(({ left, ...p }) => ({ ...p, credit: Math.max(0, left) })),
      corrections: corrected,
      writeOffs: forgivenDays,
    },
    credit,
    balanceBeforePayments: billed - corrections - forgivenTotal - writtenOffTotal,
    paidThrough,
    owes: owedAmount > 0 && oldest ? { amount: owedAmount, days: owedDates.size, oldest } : null,
    toleranceCloseOuts,
  };
}
