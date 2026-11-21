/**
 * Every personal Payee's Running account (`PayeeAccount`), one per merged Payee (#6308: a pilot's
 * alts each hold a record of the same recipient, and the group is one Payee). What is paid is read
 * here and nowhere else: an Assignment is Paid while its Payee's account has paid its day, oldest
 * first (decision 20261120-235011). Assignments no longer carry a paid mark of their own; a stored
 * `status: 'paid'` from an older client is read as billed, its money having been read into a link
 * (`legacyPaidMarks.ts`).
 *
 * Pure: the caller loads the Assignments, Payees, links and stored checkpoints.
 */
import type {
  MiningTaxAssignmentRecord,
  MiningTaxAssignmentStatus,
  MiningTaxPaymentLinkRecord,
  PayeeRecord,
} from '@/db';
import {
  PayeeAccount,
  type PayeePaymentLink,
  type StoredPayeeCheckpoint,
} from '@/engine/miningTax/payeeAccount';
import { groupPayees } from './payeeGroups';

/** The Assignment fields an account reads. */
export type BilledAssignment = Pick<
  MiningTaxAssignmentRecord,
  'id' | 'payeeId' | 'date' | 'status' | 'taxOwed'
>;

/** Whether an Assignment bills its Payee: it has one, and is neither dismissed nor unassigned. */
export function isBilled(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status'>): boolean {
  return a.payeeId !== undefined && a.status !== 'dismissed';
}

export interface PayeeAccountsInput {
  assignments: readonly BilledAssignment[];
  payees: readonly PayeeRecord[];
  links: readonly PayeePaymentLink[];
  /** The device's checkpoints, by a merged Payee's primary id. */
  checkpoints?: ReadonlyMap<string, StoredPayeeCheckpoint>;
  /**
   * What an Assignment bills its Payee; its `taxOwed` by default. The Tax tab passes what is left
   * once a Corp Tax Book bills part of it too (#6204), and nothing for one a book took over whole.
   */
  taxOf?: (a: BilledAssignment) => number;
}

/** Every personal Payee's account, looked up by any of a merged Payee's record ids. */
export class PayeeAccounts {
  private constructor(
    private readonly byPrimary: ReadonlyMap<string, PayeeAccount>,
    /** Each record's id to its merged Payee's primary id. */
    private readonly primaryOf: ReadonlyMap<string, string>
  ) {}

  static build(input: PayeeAccountsInput): PayeeAccounts {
    const taxOf = input.taxOf ?? ((a: BilledAssignment) => a.taxOwed);
    const primaryOf = new Map<string, string>();
    for (const group of groupPayees(input.payees))
      for (const member of group.members) primaryOf.set(member.id, group.primary.id);
    // A Payee no longer stored keeps its own id: its Assignments are still owed somewhere.
    const keyOf = (payeeId: string) => primaryOf.get(payeeId) ?? payeeId;
    const charges = new Map<string, { id: string; date: string; tax: number }[]>();
    for (const a of input.assignments) {
      if (!isBilled(a)) continue;
      const key = keyOf(a.payeeId!);
      charges.set(key, [...(charges.get(key) ?? []), { id: a.id, date: a.date, tax: taxOf(a) }]);
    }
    const links = new Map<string, PayeePaymentLink[]>();
    for (const l of input.links) {
      const key = keyOf(l.payeeId);
      links.set(key, [...(links.get(key) ?? []), l]);
    }
    const byPrimary = new Map<string, PayeeAccount>();
    for (const key of new Set([...charges.keys(), ...links.keys()])) {
      const stored = input.checkpoints?.get(key);
      byPrimary.set(
        key,
        PayeeAccount.build({
          payeeId: key,
          charges: charges.get(key) ?? [],
          links: links.get(key) ?? [],
          ...(stored ? { stored } : {}),
        })
      );
    }
    return new PayeeAccounts(byPrimary, primaryOf);
  }

  /** A merged Payee's primary id, for any of its records' ids. */
  primaryIdOf(payeeId: string): string {
    return this.primaryOf.get(payeeId) ?? payeeId;
  }

  /** The account of the Payee a record id belongs to; undefined while nothing bills or pays it. */
  of(payeeId: string): PayeeAccount | undefined {
    return this.byPrimary.get(this.primaryIdOf(payeeId));
  }

  /** Every account, by its merged Payee's primary id. */
  entries(): IterableIterator<[string, PayeeAccount]> {
    return this.byPrimary.entries();
  }

  /** The newest day a Payee has nothing owed on or before; null while none is paid. */
  paidThroughOf(payeeId: string): string | null {
    return this.of(payeeId)?.paidThrough ?? null;
  }

  /** Whether an Assignment's day is paid on its Payee's account. */
  isPaid(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>): boolean {
    return isBilled(a) && this.of(a.payeeId!)?.isPaid(a.date) === true;
  }

  /**
   * An Assignment's status as the tab reads it: Paid while its Payee's account has paid its day,
   * Outstanding while not; a review or a dismissal is what it is.
   */
  statusOf(
    a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>
  ): MiningTaxAssignmentStatus {
    if (a.status === 'needs-review' || a.status === 'dismissed') return a.status;
    return this.isPaid(a) ? 'paid' : 'outstanding';
  }

  /**
   * The Assignment as the tab reads it (`statusOf`), its legacy paid mark left off: only ever a
   * view, never written back.
   */
  view<T extends MiningTaxAssignmentRecord>(a: T): T {
    const status = this.statusOf(a);
    if (status === a.status && a.payment === undefined && a.paidAt === undefined) return a;
    const out = { ...a, status };
    delete out.payment;
    delete out.paidAt;
    return out;
  }
}

/** The plain link of a stored record. */
export function linkOf(record: MiningTaxPaymentLinkRecord): PayeePaymentLink {
  return {
    payeeId: record.payeeId,
    kind: record.kind,
    refId: record.refId,
    amount: record.amount,
    paidOn: record.paidOn,
    source: record.source,
  };
}
