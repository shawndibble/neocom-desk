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

export type BilledAssignment = Pick<
  MiningTaxAssignmentRecord,
  'id' | 'payeeId' | 'date' | 'status' | 'taxOwed' | 'updatedAt'
>;

export function isBilled(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status'>): boolean {
  return a.payeeId !== undefined && a.status !== 'dismissed';
}

export interface PayeeRunningAccountsInput {
  assignments: readonly BilledAssignment[];
  payees: readonly PayeeRecord[];
  links: readonly PayeePaymentLink[];
  billedElsewhere?: ReadonlyMap<string, number>;
  bookOwned?: ReadonlySet<string>;
}

export class PayeeRunningAccounts {
  private constructor(
    private readonly byPrimary: ReadonlyMap<string, PayeeRunningAccount>,
    private readonly primaryOf: ReadonlyMap<string, string>,
    private readonly history: ReadonlyMap<string, PayeeRunningAccount> = new Map(),
    private readonly owned: ReadonlySet<string> = new Set(),
    private readonly archived: ReadonlySet<string> = new Set()
  ) {}

  static build(input: PayeeRunningAccountsInput): PayeeRunningAccounts {
    const taxOf = (a: BilledAssignment) =>
      a.taxOwed * (1 - Math.min(1, input.billedElsewhere?.get(a.id) ?? 0));
    const primaryOf = new Map<string, string>();
    for (const group of groupPayees(input.payees))
      for (const member of group.members) primaryOf.set(member.id, group.primary.id);
    const keyOf = (payeeId: string) => primaryOf.get(payeeId) ?? payeeId;
    const charges = new Map<string, { id: string; date: string; tax: number }[]>();
    const written = new Map<string, { updatedAt: number }[]>();
    for (const a of input.assignments) {
      if (!isBilled(a)) continue;
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

  primaryIdOf(payeeId: string): string {
    return this.primaryOf.get(payeeId) ?? payeeId;
  }

  of(payeeId: string): PayeeRunningAccount | undefined {
    return this.byPrimary.get(this.primaryIdOf(payeeId));
  }

  isArchived(payeeId: string): boolean {
    return this.archived.has(this.primaryIdOf(payeeId));
  }

  isBookOwned(payeeId: string): boolean {
    return this.owned.has(this.primaryIdOf(payeeId));
  }

  historyOf(payeeId: string): PayeeRunningAccount | undefined {
    return this.history.get(this.primaryIdOf(payeeId));
  }

  entries(): IterableIterator<[string, PayeeRunningAccount]> {
    return this.byPrimary.entries();
  }

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

  assignable<P extends Pick<PayeeRecord, 'id'>>(payees: readonly P[]): P[] {
    return payees.filter((p) => !this.isArchived(p.id));
  }

  paidThroughOf(payeeId: string): string | null {
    return (this.of(payeeId) ?? this.historyOf(payeeId))?.paidThrough ?? null;
  }

  isPaid(a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>): boolean {
    return (
      isBilled(a) && (this.of(a.payeeId!) ?? this.historyOf(a.payeeId!))?.isPaid(a.date) === true
    );
  }

  statusOf(
    a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>
  ): MiningTaxAssignmentStatus {
    if (a.status === 'needs-review' || a.status === 'dismissed') return a.status;
    return this.isPaid(a) ? 'paid' : 'outstanding';
  }

  displayStatusOf(
    a: Pick<MiningTaxAssignmentRecord, 'payeeId' | 'status' | 'date'>
  ): MiningTaxAssignmentStatus | 'tracked' {
    const status = this.statusOf(a);
    return status === 'outstanding' && this.isBookOwned(a.payeeId!) ? 'tracked' : status;
  }

  view<T extends MiningTaxAssignmentRecord>(a: T): T {
    return this.viewAs(a, this.statusOf(a));
  }

  displayView<T extends MiningTaxAssignmentRecord>(a: T): T {
    return this.viewAs(a, this.displayStatusOf(a));
  }

  private viewAs<T extends MiningTaxAssignmentRecord>(
    a: T,
    status: MiningTaxAssignmentStatus | 'tracked'
  ): T {
    if (status === a.status && a.payment === undefined && a.paidAt === undefined) return a;
    const out = { ...a, status: status as MiningTaxAssignmentStatus };
    delete out.payment;
    delete out.paidAt;
    return out;
  }
}

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

export function withPaidStatus(
  entries: readonly MoonMiningTaxRow[],
  accounts: PayeeRunningAccounts
): MoonMiningTaxRow[] {
  return entries.map((row) => {
    const assignments = row.assignments.map((a) => accounts.displayView(a));
    return assignments.every((a, i) => a === row.assignments[i]) ? row : { ...row, assignments };
  });
}
