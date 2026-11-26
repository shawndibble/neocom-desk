import { MinerRunningAccount, type RunningAccountOwes } from '../corpTaxBook/minerRunningAccount';
import type { PaymentOutcome } from '../corpTaxBook/paymentPreview';
import type { TaxPayment } from '../corpTaxBook/payments';

export type PayeePaymentKind = 'journal' | 'contract' | 'recorded' | 'legacy';

export interface PayeePaymentRef {
  kind: 'journal' | 'contract';
  refId: number;
}

export interface PayeePaymentLink {
  payeeId: string;
  kind: PayeePaymentKind;
  refId: number | string;
  amount: number;
  paidOn: string;
  source: 'auto' | 'manual';
  characterId?: number;
  refs?: readonly PayeePaymentRef[];
}

export function paymentLinkKey(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): string {
  return `${link.kind}:${link.refId}`;
}

export function heldPaymentKeys(links: readonly PayeePaymentLink[]): Set<string> {
  const out = new Set<string>();
  for (const l of links) {
    out.add(paymentLinkKey(l));
    for (const ref of l.refs ?? []) out.add(paymentLinkKey(ref));
  }
  return out;
}

export function isBareMark(link: Pick<PayeePaymentLink, 'kind' | 'refId'>): boolean {
  return link.kind === 'legacy' && typeof link.refId === 'string' && link.refId.startsWith('mark:');
}

export interface PayeeMarkedDay {
  id: string;
  date: string | null;
  amount: number;
}

export interface PayeeCharge {
  id: string;
  date: string;
  tax: number;
}

export interface PayeeRunningAccountInput {
  payeeId: string;
  charges: readonly PayeeCharge[];
  links: readonly PayeePaymentLink[];
}

export const linkAt = (link: Pick<PayeePaymentLink, 'paidOn'>) => `${link.paidOn}T00:00:00.000Z`;

function taxPaymentOf(payeeId: string, link: PayeePaymentLink): TaxPayment {
  return {
    id: paymentLinkKey(link),
    minerId: payeeId,
    characterId: 0,
    amount: link.amount,
    at: linkAt(link),
    source: 'manual',
  };
}

export class PayeeRunningAccount {
  private constructor(
    readonly payeeId: string,
    readonly charges: readonly PayeeCharge[],
    readonly links: readonly PayeePaymentLink[],
    readonly account: MinerRunningAccount,
    readonly marked: readonly PayeeMarkedDay[]
  ) {}

  static build(input: PayeeRunningAccountInput): PayeeRunningAccount {
    const links = input.links;
    const days = input.charges.map((c) => ({ date: c.date, tax: c.tax }));
    const money = links.filter((l) => !isBareMark(l)).map((l) => taxPaymentOf(input.payeeId, l));
    const marks = links
      .filter(isBareMark)
      .sort((a, b) => paymentLinkKey(a).localeCompare(paymentLinkKey(b)));
    const byMoney = MinerRunningAccount.build({ days, payments: money });
    const left = new Map<string, number>();
    const marked: PayeeMarkedDay[] = [];
    const settles: { date: string; tax: number }[] = [];
    for (const mark of marks) {
      const charge = input.charges.find((c) => `mark:${c.id}` === mark.refId);
      const day = charge ? byMoney.day(charge.date) : undefined;
      if (!charge || !day) {
        marked.push({ id: paymentLinkKey(mark), date: null, amount: 0 });
        continue;
      }
      const open = left.get(charge.date) ?? (day.held ? 0 : day.remaining);
      const amount = Math.max(0, Math.min(mark.amount, charge.tax, open));
      left.set(charge.date, open - amount);
      marked.push({ id: paymentLinkKey(mark), date: charge.date, amount });
      if (amount > 0) settles.push({ date: charge.date, tax: -amount });
    }
    const account =
      settles.length === 0
        ? byMoney
        : MinerRunningAccount.build({ days: [...days, ...settles], payments: money });
    return new PayeeRunningAccount(input.payeeId, input.charges, links, account, marked);
  }

  get paidThrough(): string | null {
    return this.account.paidThrough;
  }

  get owes(): RunningAccountOwes | null {
    return this.account.owes;
  }

  get credit(): number {
    return this.account.credit;
  }

  get balance(): number {
    return this.account.balance;
  }

  isPaid(date: string): boolean {
    return this.account.day(date)?.settled === true;
  }

  owedOf(charge: Pick<PayeeCharge, 'date' | 'tax'>): number {
    return this.account.day(charge.date) ? this.account.owedOf(charge.date, charge.tax) : 0;
  }

  preview(amount: number, paidOn: string): PaymentOutcome {
    const link: PayeePaymentLink = {
      payeeId: this.payeeId,
      kind: 'recorded',
      refId: '\u0000preview',
      amount,
      paidOn,
      source: 'manual',
    };
    const after = PayeeRunningAccount.build({
      payeeId: this.payeeId,
      charges: this.charges,
      links: [...this.links, link],
    }).account;
    const mine = after.applications.payments.find((p) => p.paymentId === paymentLinkKey(link));
    const lines = (mine?.days ?? []).map((d) => {
      const day = after.day(d.date);
      return {
        date: d.date,
        applied: d.amount,
        remainingAfter: day?.settled ? 0 : (day?.remaining ?? 0),
        settled: day?.settled ?? false,
      };
    });
    return {
      lines,
      owedBefore: this.account.owes?.amount ?? 0,
      owedAfter: after.owes?.amount ?? 0,
      creditAfter: after.credit,
      creditAdded: Math.max(0, after.credit - this.account.credit),
    };
  }
}
