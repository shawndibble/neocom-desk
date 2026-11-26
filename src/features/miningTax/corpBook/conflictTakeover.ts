import type { MiningTaxAssignmentRecord } from '@/db';
import {
  combineOverlaps,
  previewTakeover,
  type BookOverlap,
  type BookRowView,
} from '@/engine/corpTaxBook/personal';
import type { OreLine } from '@/engine/miningTax/types';

export interface TakeoverStep {
  assignment: MiningTaxAssignmentRecord;
  before: readonly OreLine[];
  after: OreLine[];
}

export function planTakeover(
  view: BookRowView,
  siblings: readonly BookRowView[],
  everyAssignment: readonly MiningTaxAssignmentRecord[]
): { mine: MiningTaxAssignmentRecord[]; steps: TakeoverStep[]; overlap: BookRowView['overlap'] } {
  const conflict = view.state === 'conflict';
  const overlap = conflict
    ? combineOverlaps([view.overlap, ...siblings.map((s) => s.overlap)])
    : view.overlap;
  const mine = overlap
    ? everyAssignment.filter(
        (a) =>
          a.characterId === view.characterId &&
          a.date === view.date &&
          a.solarSystemId === view.solarSystemId &&
          a.status !== 'dismissed' &&
          a.payeeId !== undefined &&
          overlap.payeeIds.includes(a.payeeId)
      )
    : [];
  const parts = (
    conflict ? [view.overlap, ...siblings.map((s) => s.overlap)] : [view.overlap]
  ).filter((o): o is BookOverlap => o !== undefined);
  const current = mine.map((a) => ({
    payeeId: a.payeeId ?? '',
    taxPct: a.taxPct,
    oreLines: a.oreLines,
    status: a.status,
  }));
  const before = current.map((c) => c.oreLines);
  for (const part of parts) {
    const at = current.flatMap((c, i) => (part.payeeIds.includes(c.payeeId) ? [i] : []));
    for (const step of previewTakeover(
      at.map((i) => current[i]!),
      part.ore
    )) {
      const i = at[step.index]!;
      current[i] = { ...current[i]!, oreLines: step.after };
    }
  }
  const steps = current.flatMap((c, index) =>
    c.oreLines === before[index]
      ? []
      : [{ assignment: mine[index]!, before: before[index]!, after: c.oreLines as OreLine[] }]
  );
  return { mine, steps, overlap };
}
