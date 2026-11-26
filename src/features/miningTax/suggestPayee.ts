import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { defaultPayeeForSystem } from '@/engine/miningTax/defaultSystems';

export interface PayeeSuggestion {
  suggested: PayeeRecord | undefined;
  fromHistory: boolean;
  ranked: PayeeRecord[];
}

export function systemsByPayee(
  assignments: readonly MiningTaxAssignmentRecord[],
  payees: readonly PayeeRecord[]
): Map<string, Set<number>> {
  const known = new Set(payees.map((p) => p.id));
  const out = new Map<string, Set<number>>();
  for (const a of assignments) {
    if (a.payeeId === undefined || a.status === 'dismissed' || !known.has(a.payeeId)) continue;
    let systems = out.get(a.payeeId);
    if (!systems) out.set(a.payeeId, (systems = new Set()));
    systems.add(a.solarSystemId);
  }
  return out;
}

export function suggestPayeeForSystem(
  assignments: readonly MiningTaxAssignmentRecord[],
  payees: readonly PayeeRecord[],
  solarSystemId: number,
  characterId: number,
  aliases: ReadonlyMap<string, string> = new Map()
): PayeeSuggestion {
  const canon = (id: string) => aliases.get(id) ?? id;
  const byId = new Map(payees.map((p) => [p.id, p]));
  const usesHere = new Map<string, number>();
  let last: MiningTaxAssignmentRecord | undefined;

  for (const a of assignments) {
    if (a.payeeId === undefined || a.status === 'dismissed' || !byId.has(a.payeeId)) continue;
    if (a.solarSystemId !== solarSystemId) continue;
    usesHere.set(canon(a.payeeId), (usesHere.get(canon(a.payeeId)) ?? 0) + 1);
    if (!last || a.date > last.date || (a.date === last.date && a.updatedAt > last.updatedAt)) {
      last = a;
    }
  }

  const fromHistory = last?.payeeId !== undefined ? byId.get(canon(last.payeeId)) : undefined;
  const byDefault = defaultPayeeForSystem(payees, characterId, solarSystemId);
  const suggested = fromHistory ?? (byDefault ? byId.get(canon(byDefault.id)) : undefined);

  const ranked = payees
    .filter((p) => !aliases.has(p.id))
    .sort((a, b) => {
      if (a.id === suggested?.id) return -1;
      if (b.id === suggested?.id) return 1;
      const uses = (usesHere.get(b.id) ?? 0) - (usesHere.get(a.id) ?? 0);
      return uses !== 0 ? uses : a.name.localeCompare(b.name);
    });

  return { suggested, fromHistory: fromHistory !== undefined, ranked };
}
