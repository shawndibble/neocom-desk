import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';

export interface PayeeSuggestion {
  /** The Payee to pre-select, or `undefined` when nothing in the pilot's own history points at one. */
  suggested: PayeeRecord | undefined;
  /** Every Payee, best first: the suggestion, then by uses in this system, then by name. */
  ranked: PayeeRecord[];
  /** Every system each Payee has been assigned in, learned from the pilot's own Assignments. */
  systemsByPayee: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * Which Payee a new Assignment in `solarSystemId` most likely belongs to
 * (scope decision 20261004, "suggest the Payee last used in the system").
 *
 * A Payee used to remember a single `systemId`, which cannot describe a
 * system three landlords share or a landlord with moons in three systems. The
 * pilot's own Assignments can: the one most recently mined in this system is
 * the best guess for the next, and how often each other Payee was used here
 * orders the rest. The legacy `systemId` only breaks a tie when this system
 * has no history at all. Still only ever a pre-selection the pilot confirms,
 * never an Assignment made on their behalf.
 */
export function suggestPayeeForSystem(
  assignments: readonly MiningTaxAssignmentRecord[],
  payees: readonly PayeeRecord[],
  solarSystemId: number
): PayeeSuggestion {
  const byId = new Map(payees.map((p) => [p.id, p]));
  const systemsByPayee = new Map<string, Set<number>>();
  const usesHere = new Map<string, number>();
  let last: MiningTaxAssignmentRecord | undefined;

  for (const a of assignments) {
    if (a.payeeId === undefined || a.status === 'dismissed' || !byId.has(a.payeeId)) continue;
    let systems = systemsByPayee.get(a.payeeId);
    if (!systems) systemsByPayee.set(a.payeeId, (systems = new Set()));
    systems.add(a.solarSystemId);
    if (a.solarSystemId !== solarSystemId) continue;
    usesHere.set(a.payeeId, (usesHere.get(a.payeeId) ?? 0) + 1);
    if (!last || a.date > last.date || (a.date === last.date && a.updatedAt > last.updatedAt)) {
      last = a;
    }
  }

  const suggested =
    (last?.payeeId !== undefined ? byId.get(last.payeeId) : undefined) ??
    payees.find((p) => p.systemId === solarSystemId);

  const ranked = [...payees].sort((a, b) => {
    if (a.id === suggested?.id) return -1;
    if (b.id === suggested?.id) return 1;
    const uses = (usesHere.get(b.id) ?? 0) - (usesHere.get(a.id) ?? 0);
    return uses !== 0 ? uses : a.name.localeCompare(b.name);
  });

  return { suggested, ranked, systemsByPayee };
}
