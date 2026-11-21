/**
 * Every personal Payee's Running account (`PayeeRunningAccount`), one per merged Payee (#6308: a pilot's
 * alts each hold a record of the same recipient, and the group is one Payee). One build, the same
 * inputs everywhere (`loadRunningAccountInputs`): row statuses, owed figures, safeguards and the journal
 * read the same accounts. What is paid is read here and nowhere else: an Assignment is Paid while its Payee's account has paid its day, oldest
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
  PayeeRunningAccount,
  type PayeePaymentLink,
  type StoredPayeeCheckpoint,
} from '@/engine/miningTax/payeeRunningAccount';
import { groupPayees } from './payeeGroups';
import type { LinkablePayee } from './paymentLinks';
import type { MoonMiningTaxRow } from './snapshot';

/** The Assignment fields an account reads. */
export type BilledAssignment = Pick<
  MiningTaxAssignmentRecord,
  'id' | 'payeeId' | 'date' | 'status' | 'taxOwed'
>;

/** Whether an Assignment bills its Payee: it has one, and is neither dismissed nor unassigned. */
export function isBilled(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status'>): boolean {
  return a.payeeId !== undefined && a.status !== 'dismissed';
}

export interface PayeeRunningAccountsInput {
  assignments: readonly BilledAssignment[];
  payees: readonly PayeeRecord[];
  links: readonly PayeePaymentLink[];
  /** The device's checkpoints, by a merged Payee's primary id. */
  checkpoints?: ReadonlyMap<string, StoredPayeeCheckpoint>;
  /**
   * By Assignment id, the share (0–1) of its tax a Corp Tax Book bills too (#6204), 1 for one a
   * book took over whole: it bills its Payee only what is left. As the device last saw the books
   * (`saveBilledElsewhere`), so every build bills the same.
   */
  billedElsewhere?: ReadonlyMap<string, number>;
}

/** Every personal Payee's account, looked up by any of a merged Payee's record ids. */
export class PayeeRunningAccounts {
  private constructor(
    private readonly byPrimary: ReadonlyMap<string, PayeeRunningAccount>,
    /** Each record's id to its merged Payee's primary id. */
    private readonly primaryOf: ReadonlyMap<string, string>
  ) {}

  static build(input: PayeeRunningAccountsInput): PayeeRunningAccounts {
    const taxOf = (a: BilledAssignment) =>
      a.taxOwed * (1 - Math.min(1, input.billedElsewhere?.get(a.id) ?? 0));
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
    const byPrimary = new Map<string, PayeeRunningAccount>();
    for (const key of new Set([...charges.keys(), ...links.keys()])) {
      const stored = input.checkpoints?.get(key);
      byPrimary.set(
        key,
        PayeeRunningAccount.build({
          payeeId: key,
          charges: charges.get(key) ?? [],
          links: links.get(key) ?? [],
          ...(stored ? { stored } : {}),
        })
      );
    }
    return new PayeeRunningAccounts(byPrimary, primaryOf);
  }

  /** A merged Payee's primary id, for any of its records' ids. */
  primaryIdOf(payeeId: string): string {
    return this.primaryOf.get(payeeId) ?? payeeId;
  }

  /** The account of the Payee a record id belongs to; undefined while nothing bills or pays it. */
  of(payeeId: string): PayeeRunningAccount | undefined {
    return this.byPrimary.get(this.primaryIdOf(payeeId));
  }

  /** Every account, by its merged Payee's primary id. */
  entries(): IterableIterator<[string, PayeeRunningAccount]> {
    return this.byPrimary.entries();
  }

  /**
   * Every merged Payee a payment may be linked to, with what its account owes: what a suggestion
   * is weighed against (`paymentLinks.ts`).
   */
  linkable(payees: readonly PayeeRecord[]): LinkablePayee[] {
    return groupPayees(payees).map((g) => {
      const account = this.byPrimary.get(g.primary.id);
      return {
        id: g.primary.id,
        name: g.primary.name,
        members: g.members,
        owed: account?.owes?.amount ?? 0,
        billed: (account?.charges.length ?? 0) > 0,
      };
    });
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
    characterId: record.characterId,
    ...(record.refs ? { refs: record.refs } : {}),
    ...(record.unlinked ? { unlinked: true as const } : {}),
  };
}

/**
 * The ledger's entries as the tab reads them: each Assignment viewed through its Payee's account
 * (`PayeeRunningAccounts.view`). The Tax tab and the Overview read the same.
 */
export function withPaidStatus(
  entries: readonly MoonMiningTaxRow[],
  accounts: PayeeRunningAccounts
): MoonMiningTaxRow[] {
  return entries.map((row) => {
    const assignments = row.assignments.map((a) => accounts.view(a));
    return assignments.every((a, i) => a === row.assignments[i]) ? row : { ...row, assignments };
  });
}
