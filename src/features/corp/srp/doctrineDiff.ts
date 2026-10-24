/** A doctrine diff as readable lines: multisets of type ids grouped into "2x Module". Pure. */
import type { DoctrineDiff } from '@/engine/srpDoctrine';

export type DiffSectionKey = keyof DoctrineDiff;

export interface DiffLine {
  typeId: number;
  count: number;
}

export interface DiffSection {
  key: DiffSectionKey;
  lines: DiffLine[];
}

const ORDER: readonly DiffSectionKey[] = [
  'missingModules',
  'extraModules',
  'missingRigs',
  'extraRigs',
];

export function groupTypeIds(ids: readonly number[]): DiffLine[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([typeId, count]) => ({ typeId, count }));
}

/** The parts of a diff that say something, missing before extra, modules before rigs. */
export function diffSections(diff: DoctrineDiff): DiffSection[] {
  return ORDER.flatMap((key) =>
    diff[key].length > 0 ? [{ key, lines: groupTypeIds(diff[key]) }] : []
  );
}

export const diffTypeIds = (diff: DoctrineDiff): number[] => [
  ...new Set(ORDER.flatMap((key) => diff[key])),
];
