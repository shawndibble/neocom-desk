import { entryKey, type OreLine } from './types';

export interface CoalescableAssignment {
  id: string;
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId?: string;
  taxPct: number;
  status: string;
  groupId?: string;
  oreLines: readonly OreLine[];
  estimatedValue: number;
  taxOwed: number;
  collectsGrowth?: boolean;
}

export interface EntryMerge {
  keepId: string;
  absorbedIds: string[];
  oreLines: OreLine[];
  estimatedValue: number;
  taxOwed: number;
  collectsGrowth: boolean;
  groupId?: string;
}

function termsKey(a: CoalescableAssignment): string {
  return `${a.payeeId ?? ''}:${a.taxPct}`;
}

function sameLines(a: readonly OreLine[], b: readonly OreLine[]): boolean {
  if (a.length !== b.length) return false;
  const quantities = new Map(b.map((l) => [l.typeId, l.quantity]));
  return a.every((l) => quantities.get(l.typeId) === l.quantity);
}

function claimsMoreThan(
  members: readonly CoalescableAssignment[],
  entryLines: readonly OreLine[]
): boolean {
  const claimed = new Map<number, number>();
  for (const m of members) {
    for (const l of m.oreLines) claimed.set(l.typeId, (claimed.get(l.typeId) ?? 0) + l.quantity);
  }
  return entryLines.some((l) => (claimed.get(l.typeId) ?? 0) > l.quantity);
}

function byId(a: CoalescableAssignment, b: CoalescableAssignment): number {
  return a.id.localeCompare(b.id);
}

function bucket<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const list = out.get(key(item));
    if (list) list.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

export function planEntryMerges(
  assignments: readonly CoalescableAssignment[],
  entryLinesByKey?: ReadonlyMap<string, readonly OreLine[]>
): EntryMerge[] {
  const coverageByEntry = new Map<string, number>();
  for (const a of assignments) {
    const key = entryKey(a.characterId, a.date, a.solarSystemId);
    coverageByEntry.set(key, (coverageByEntry.get(key) ?? 0) + 1);
  }

  const fusable = assignments.filter((a) => a.status === 'outstanding');
  const buckets = bucket(
    fusable,
    (a) => `${entryKey(a.characterId, a.date, a.solarSystemId)}:${termsKey(a)}`
  );

  const merges: EntryMerge[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const groupIds = new Set(members.map((m) => m.groupId).filter((id) => id !== undefined));
    if (groupIds.size > 1) continue;
    const identical = members.every((m) => sameLines(m.oreLines, members[0].oreLines));
    const entryLines = entryLinesByKey?.get(
      entryKey(members[0].characterId, members[0].date, members[0].solarSystemId)
    );
    if (entryLinesByKey && identical && !entryLines) continue;
    const duplicate = identical && entryLines !== undefined && claimsMoreThan(members, entryLines);
    const ordered = [...members].sort(byId);
    const keep = duplicate
      ? (ordered.find((m) => m.groupId !== undefined) ?? ordered[0])
      : ordered[0];
    const absorbed = ordered.filter((m) => m !== keep);
    const entry = entryKey(keep.characterId, keep.date, keep.solarSystemId);
    const soleAfterMerge = (coverageByEntry.get(entry) ?? 0) - absorbed.length === 1;
    const quantityByType = new Map<number, number>();
    for (const member of members) {
      for (const line of member.oreLines) {
        quantityByType.set(line.typeId, (quantityByType.get(line.typeId) ?? 0) + line.quantity);
      }
    }
    merges.push({
      keepId: keep.id,
      absorbedIds: absorbed.map((a) => a.id),
      oreLines: duplicate
        ? [...keep.oreLines].sort((a, b) => a.typeId - b.typeId)
        : [...quantityByType.entries()]
            .map(([typeId, quantity]) => ({ typeId, quantity }))
            .sort((a, b) => a.typeId - b.typeId),
      estimatedValue: duplicate
        ? keep.estimatedValue
        : members.reduce((sum, m) => sum + m.estimatedValue, 0),
      taxOwed: duplicate ? keep.taxOwed : members.reduce((sum, m) => sum + m.taxOwed, 0),
      collectsGrowth: !soleAfterMerge && members.some((m) => m.collectsGrowth === true),
      ...(groupIds.size === 1 ? { groupId: [...groupIds][0] } : {}),
    });
  }
  return merges;
}

export function planGroupEjections(assignments: readonly CoalescableAssignment[]): string[] {
  const grouped = assignments.filter((a) => a.groupId !== undefined);
  const ejected: string[] = [];

  for (const members of bucket(grouped, (a) => a.groupId!).values()) {
    const anchor = [...members].sort((a, b) => a.date.localeCompare(b.date) || byId(a, b))[0];
    const disagreeing = members.filter((m) => termsKey(m) !== termsKey(anchor));
    const survivors = members.length - disagreeing.length;
    ejected.push(...(survivors < 2 ? members : disagreeing).map((m) => m.id));
  }
  return ejected.sort((a, b) => a.localeCompare(b));
}
