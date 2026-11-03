/**
 * Default Systems (GLOSSARY.md): a Payee collects moon mining tax in a list of
 * systems, and moon ore a Character mines there from the day the system was
 * added is assigned to that Payee as it reaches the Mining Ledger.
 *
 * It is the last resort. It only ever fills an entry nothing else has touched:
 * any Assignment covering the entry (a pilot's, a Survey connection's, a
 * dismissal, a split) keeps it out of the plan, and so does a pilot's
 * unassign, remembered as an opt-out. The Assignment it makes carries
 * `override: false` ("a default made this, nobody has changed it"), which is
 * what lets a Survey connection or the Corp Tax Book treat it as ore nobody
 * has assigned yet. Any pilot act clears that, and from then on it is a
 * plain Assignment.
 *
 * Pure: the caller loads entries, Assignments and Payees and writes the plan.
 */
import type { MiningLedgerEntry, OreLine } from './types';

export interface DefaultSystem {
  systemId: number;
  /** UTC `YYYY-MM-DD` the system was added; ore mined before it is never defaulted. */
  from: string;
}

/** The Payee fields the plan reads. */
export interface DefaultSystemPayee {
  id: string;
  characterId: number;
  defaultSystems?: readonly DefaultSystem[];
}

export interface DefaultAssignSlice {
  payeeId: string;
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: OreLine[];
  /** The entry's whole ore, for the double-assignment guard. */
  entryOreLines: readonly OreLine[];
}

/** An Assignment, as far as planning reads it. */
export interface DefaultCovering {
  characterId: number;
  date: string;
  solarSystemId: number;
}

/**
 * True for an Assignment the default made and no one has changed. An absent
 * flag means a pilot act, so every row stored before this existed (and every
 * one an old device writes) is an ordinary Assignment.
 */
export function isDefaultAssigned(assignment: { override?: boolean }): boolean {
  return assignment.override === false;
}

/** A default's Assignment still unpaid: the only kind a Survey connection or a Corp Tax Book may take over. */
export function isUnpaidDefault(assignment: { override?: boolean; status?: string }): boolean {
  return isDefaultAssigned(assignment) && assignment.status === 'outstanding';
}

/** The key a pilot's unassign is remembered under, so the default does not assign the entry again. */
export function defaultOptOutKey(characterId: number, date: string, solarSystemId: number): string {
  return `${characterId}|${date}|${solarSystemId}`;
}

/** The mined date inside a `defaultOptOutKey`. */
export function defaultOptOutDate(key: string): string {
  return key.split('|')[1] ?? '';
}

/** The Character's Payee that defaults `systemId`; the lowest id if (stale data) two do. */
export function defaultPayeeForSystem<P extends DefaultSystemPayee>(
  payees: readonly P[],
  characterId: number,
  systemId: number
): P | undefined {
  return payees
    .filter(
      (p) => p.characterId === characterId && p.defaultSystems?.some((s) => s.systemId === systemId)
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function planDefaultAssign(
  entries: readonly MiningLedgerEntry[],
  assignments: readonly DefaultCovering[],
  payees: readonly DefaultSystemPayee[],
  optedOut: ReadonlySet<string>
): DefaultAssignSlice[] {
  const covered = new Set(
    assignments.map((a) => defaultOptOutKey(a.characterId, a.date, a.solarSystemId))
  );
  const slices: DefaultAssignSlice[] = [];
  for (const e of entries) {
    const key = defaultOptOutKey(e.characterId, e.date, e.solarSystemId);
    if (covered.has(key) || optedOut.has(key)) continue;
    const payee = defaultPayeeForSystem(payees, e.characterId, e.solarSystemId);
    const since = payee?.defaultSystems?.find((s) => s.systemId === e.solarSystemId)?.from;
    if (!payee || since === undefined || e.date < since) continue;
    slices.push({
      payeeId: payee.id,
      characterId: e.characterId,
      date: e.date,
      solarSystemId: e.solarSystemId,
      oreLines: e.oreLines.map((l) => ({ ...l })),
      entryOreLines: e.oreLines,
    });
  }
  return slices;
}
