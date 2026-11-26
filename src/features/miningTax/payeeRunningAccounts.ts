/**
 * Every personal Payee's Running account (`PayeeRunningAccount`), one per merged Payee (#6308: a pilot's
 * alts each hold a record of the same recipient, and the group is one Payee). One build, the same
 * inputs everywhere (`loadRunningAccountInputs`): row statuses, owed figures, safeguards and the journal
 * read the same accounts. What is paid is read here and nowhere else: an Assignment is Paid while its Payee's account has paid its day, oldest
 * first (decision 20261120-235011). Assignments carry no paid mark of their own; an old one is read
 * into a link once per device and cleared (`readLegacyPaidMarks`), and is read as billed until then.
 *
 * Pure: the caller loads the Assignments, Payees and links.
 */
import type {
  MiningTaxAssignmentRecord,
  MiningTaxAssignmentStatus,
  MiningTaxPaymentLinkRecord,
  PayeeRecord,
} from '@/db';
import { isArchivedPayee } from '@/engine/miningTax/archivedPayee';
import { PayeeRunningAccount, type PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { groupPayees } from './payeeGroups';
import type { LinkablePayee } from './paymentLinks';
import type { MoonMiningTaxRow } from './snapshot';

/** The Assignment fields an account reads. */
export type BilledAssignment = Pick<
  MiningTaxAssignmentRecord,
  'id' | 'payeeId' | 'date' | 'status' | 'taxOwed' | 'updatedAt'
>;

/** Whether an Assignment bills its Payee: it has one, and is neither dismissed nor unassigned. */
export function isBilled(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status'>): boolean {
  return a.payeeId !== undefined && a.status !== 'dismissed';
}

export interface PayeeRunningAccountsInput {
  assignments: readonly BilledAssignment[];
  payees: readonly PayeeRecord[];
  links: readonly PayeePaymentLink[];
  /**
   * By Assignment id, the share (0–1) of its tax a Corp Tax Book bills too (#6204), 1 for one a
   * book took over whole: it bills its Payee only what is left. As the device last saw the books
   * (`saveBilledElsewhere`), so every build bills the same.
   */
  billedElsewhere?: ReadonlyMap<string, number>;
  /**
   * The ids of the Payee records that are a Corp Tax Book's corporation (`bookOwnedPayeeIds`): the
   * book is the only authority for what the pilot owes or has paid that corporation, so such a
   * Payee has no account that counts (`of`), only its old history (`historyOf`), read-only.
   */
  bookOwned?: ReadonlySet<string>;
}

/** Every personal Payee's account, looked up by any of a merged Payee's record ids. */
export class PayeeRunningAccounts {
  private constructor(
    private readonly byPrimary: ReadonlyMap<string, PayeeRunningAccount>,
    /** Each record's id to its merged Payee's primary id. */
    private readonly primaryOf: ReadonlyMap<string, string>,
    /** The accounts of the merged Payees a book is the authority for: never counted. */
    private readonly history: ReadonlyMap<string, PayeeRunningAccount> = new Map(),
    /** The primary ids of the merged Payees a book is the authority for. */
    private readonly owned: ReadonlySet<string> = new Set(),
    /** The primary ids of the merged Payees the pilot archived (`isArchivedPayee`). */
    private readonly archived: ReadonlySet<string> = new Set()
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
    // When each Payee's billed Assignments were last written, for the archive rule.
    const written = new Map<string, { updatedAt: number }[]>();
    for (const a of input.assignments) {
      if (!isBilled(a)) continue;
      // A day a book bills whole is the book's, not this Payee's: no charge, not a zero line.
      if ((input.billedElsewhere?.get(a.id) ?? 0) >= 1) continue;
      const key = keyOf(a.payeeId!);
      charges.set(key, [...(charges.get(key) ?? []), { id: a.id, date: a.date, tax: taxOf(a) }]);
      written.set(key, [...(written.get(key) ?? []), { updatedAt: a.updatedAt }]);
    }
    const links = new Map<string, PayeePaymentLink[]>();
    for (const l of input.links) {
      const key = keyOf(l.payeeId);
      links.set(key, [...(links.get(key) ?? []), l]);
    }
    // A merged Payee is a book's when any of its records is.
    const owned = new Set([...(input.bookOwned ?? [])].map((id) => primaryOf.get(id) ?? id));
    const byPrimary = new Map<string, PayeeRunningAccount>();
    const history = new Map<string, PayeeRunningAccount>();
    for (const key of new Set([...charges.keys(), ...links.keys()])) {
      (owned.has(key) ? history : byPrimary).set(
        key,
        PayeeRunningAccount.build({
          payeeId: key,
          charges: charges.get(key) ?? [],
          links: links.get(key) ?? [],
        })
      );
    }
    // Archived: every record of the merged Payee carries it, nothing is owed, nothing is newer.
    const archived = new Set<string>();
    for (const group of groupPayees(input.payees)) {
      const stamps = group.members.map((m) => m.archivedAt);
      if (stamps.some((a) => a === undefined)) continue;
      const account = byPrimary.get(group.primary.id);
      if (
        isArchivedPayee(Math.max(...(stamps as number[])), account?.owes ?? null, [
          ...(written.get(group.primary.id) ?? []),
        ])
      )
        archived.add(group.primary.id);
    }
    return new PayeeRunningAccounts(byPrimary, primaryOf, history, owned, archived);
  }

  /** A merged Payee's primary id, for any of its records' ids. */
  primaryIdOf(payeeId: string): string {
    return this.primaryOf.get(payeeId) ?? payeeId;
  }

  /**
   * The account of the Payee a record id belongs to; undefined while nothing bills or pays it, and
   * for a Payee a book is the authority for (`isBookOwned`): its figures count nowhere.
   */
  of(payeeId: string): PayeeRunningAccount | undefined {
    return this.byPrimary.get(this.primaryIdOf(payeeId));
  }

  /**
   * Whether the pilot archived this Payee and it still reads archived: no card, its credit
   * counts nowhere. Its account and ledger stay reachable (`of`) from Manage Payees.
   */
  isArchived(payeeId: string): boolean {
    return this.archived.has(this.primaryIdOf(payeeId));
  }

  /** Whether a Corp Tax Book is the authority for this Payee: it is that book's corporation. */
  isBookOwned(payeeId: string): boolean {
    return this.owned.has(this.primaryIdOf(payeeId));
  }

  /**
   * The old personal history of a Payee a book is the authority for, shown read-only: its balance
   * and credit are no one's figure. Undefined for any other Payee, or one with no history.
   */
  historyOf(payeeId: string): PayeeRunningAccount | undefined {
    return this.history.get(this.primaryIdOf(payeeId));
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
    return groupPayees(payees)
      .filter((g) => !this.owned.has(g.primary.id) && !this.archived.has(g.primary.id))
      .map((g) => {
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

  /**
   * The Payee records a new Assignment may be offered, suggested or pre-filled with (the picker, the
   * last-used and Default System suggestions): never an archived one. A Payee a book is the
   * authority for is offered: giving it ore is how the member says the day is that corporation's,
   * which its book then bills (decision 20261125-184957).
   */
  assignable<P extends Pick<PayeeRecord, 'id'>>(payees: readonly P[]): P[] {
    return payees.filter((p) => !this.isArchived(p.id));
  }

  /** The newest day a Payee has nothing owed on or before; null while none is paid. */
  paidThroughOf(payeeId: string): string | null {
    return (this.of(payeeId) ?? this.historyOf(payeeId))?.paidThrough ?? null;
  }

  /**
   * Whether an Assignment's day is paid on its Payee's account. A day of a Payee a book is the
   * authority for reads off its old history, only to label the row: it is owed to no one here.
   */
  isPaid(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>): boolean {
    return (
      isBilled(a) && (this.of(a.payeeId!) ?? this.historyOf(a.payeeId!))?.isPaid(a.date) === true
    );
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
   * `statusOf` as a row is shown: a day of a Payee a book is the authority for that its old
   * history has not paid is Tracked by the book, not Outstanding, since nothing here can settle it.
   * For the display only: every safeguard reads `statusOf`, where such a day is still unpaid.
   */
  displayStatusOf(
    a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>
  ): MiningTaxAssignmentStatus | 'tracked' {
    const status = this.statusOf(a);
    return status === 'outstanding' && this.isBookOwned(a.payeeId!) ? 'tracked' : status;
  }

  /**
   * The Assignment as the tab reads it (`statusOf`), its legacy paid mark left off: only ever a
   * view, never written back.
   */
  view<T extends MiningTaxAssignmentRecord>(a: T): T {
    return this.viewAs(a, this.statusOf(a));
  }

  /** `view` as a row is shown (`displayStatusOf`): what the Tax tab and the Overview read. */
  displayView<T extends MiningTaxAssignmentRecord>(a: T): T {
    return this.viewAs(a, this.displayStatusOf(a));
  }

  private viewAs<T extends MiningTaxAssignmentRecord>(
    a: T,
    status: MiningTaxAssignmentStatus | 'tracked'
  ): T {
    if (status === a.status && a.payment === undefined && a.paidAt === undefined) return a;
    // `tracked` is a display status only: it is never stored.
    const out = { ...a, status: status as MiningTaxAssignmentStatus };
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
  };
}

/**
 * The ledger's entries as the tab reads them: each Assignment viewed through its Payee's account
 * (`PayeeRunningAccounts.displayView`). The Tax tab and the Overview read the same.
 */
export function withPaidStatus(
  entries: readonly MoonMiningTaxRow[],
  accounts: PayeeRunningAccounts
): MoonMiningTaxRow[] {
  return entries.map((row) => {
    const assignments = row.assignments.map((a) => accounts.displayView(a));
    return assignments.every((a, i) => a === row.assignments[i]) ? row : { ...row, assignments };
  });
}
