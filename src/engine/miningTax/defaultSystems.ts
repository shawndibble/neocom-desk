import type { MiningLedgerEntry, OreLine } from './types';

export interface DefaultSystem {
  systemId: number;
  from: string;
}

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
  entryOreLines: readonly OreLine[];
}

export interface DefaultCovering {
  characterId: number;
  date: string;
  solarSystemId: number;
}

export function isDefaultAssigned(assignment: { override?: boolean }): boolean {
  return assignment.override === false;
}

export function isUnpaidDefault(assignment: { override?: boolean; status?: string }): boolean {
  return isDefaultAssigned(assignment) && assignment.status === 'outstanding';
}

export function defaultOptOutKey(characterId: number, date: string, solarSystemId: number): string {
  return `${characterId}|${date}|${solarSystemId}`;
}

export function defaultOptOutDate(key: string): string {
  return key.split('|')[1] ?? '';
}

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
