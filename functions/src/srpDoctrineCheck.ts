// SRP doctrine-fit (#4857, ADR 0026): runs the pure match engine on a server-fetched killmail.
// No Firestore, no fetch. A Hull Rule's `doctrineIds` are hull-scope only: a doctrine is for one
// hull, and a class rule has no single hull to compare against.

import { FITTING_RACKS, MUTAPLASMID_BASES } from './data/srpDoctrineData.js';
import {
  basesOfFromData,
  killmailFittedSet,
  matchDoctrine,
  type DoctrineCandidate,
  type FittedSet,
  type KillmailVictimItems,
} from './srpDoctrine.js';
import type { EsiKillmail } from './srpKillmail.js';
import type { DoctrineCheckRecord, DoctrineFit, HullRule } from './srpTypes.js';

const rackOf = (typeId: number): string | undefined => FITTING_RACKS[String(typeId)];
const basesOf = basesOfFromData({
  mutaplasmids: Object.fromEntries(MUTAPLASMID_BASES.map((m, i) => [String(i), m])),
});

export function fittedFromKillmail(victim: EsiKillmail['victim']): FittedSet {
  const items: NonNullable<KillmailVictimItems['items']> = [];
  for (const i of victim.items) {
    if (typeof i.item_type_id === 'number' && typeof i.flag === 'number') {
      items.push({
        item_type_id: i.item_type_id,
        flag: i.flag,
        quantity_destroyed: i.quantity_destroyed,
        quantity_dropped: i.quantity_dropped,
      });
    }
  }
  return killmailFittedSet({ ship_type_id: victim.shipTypeId, items }, rackOf);
}

/** The hull's own rule: the only kind that carries doctrines. */
export const hullRuleOf = (rules: readonly HullRule[], hullTypeId: number): HullRule | undefined =>
  rules.find((r) => r.scope === 'hull' && r.id === hullTypeId);

/**
 * `doctrines` holds the corp's fits that still exist; a listed id that was deleted is skipped.
 * No rule, no ids or none surviving: not-checked.
 */
export function checkDoctrine(
  victim: EsiKillmail['victim'],
  rule: HullRule | undefined,
  doctrines: ReadonlyMap<string, DoctrineFit>
): DoctrineCheckRecord {
  const candidates: DoctrineCandidate[] = [];
  for (const id of rule?.doctrineIds ?? []) {
    const d = doctrines.get(id);
    if (d) candidates.push({ id, fit: d.snapshot });
  }
  const check = matchDoctrine(fittedFromKillmail(victim), candidates, basesOf);
  const name = check.doctrineId ? doctrines.get(check.doctrineId)?.name : undefined;
  return name === undefined ? check : { ...check, doctrineName: name };
}
