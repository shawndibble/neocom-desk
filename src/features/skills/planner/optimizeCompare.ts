import type { RemapSegment } from '@/engine/optimizer';
import type { PlanStep } from '@/engine/types';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from './planHeaderStats';

export interface CurrentCompareRow {
  step: PlanStep;
  position: number;
  /** Where the optimizer puts this step; null when it stays put. */
  movesTo: number | null;
}

export type ProposedCompareRow =
  | {
      kind: 'step';
      step: PlanStep;
      position: number;
      /** Position in the current plan; null when unchanged (or the step is not in it). */
      from: number | null;
    }
  | { kind: 'remap'; segment: RemapSegment; before: PlanStep };

const keyOf = (step: PlanStep) => `${step.skillTypeID}:${step.level}`;

/**
 * Lines "Optimize for me"'s two orders up for a side-by-side preview: the
 * current plan with where each moved step goes, and the proposed plan with
 * where each came from and a row for every Remap Marker the optimizer places.
 * The leading `remap: false` segment is the pilot's own attributes, not a marker.
 */
export function compareOrders(
  current: readonly PlanStep[],
  proposed: readonly PlanStep[],
  segments: readonly RemapSegment[]
): { current: CurrentCompareRow[]; proposed: ProposedCompareRow[] } {
  const currentAt = new Map(current.map((step, i) => [keyOf(step), i + 1]));
  const proposedAt = new Map(proposed.map((step, i) => [keyOf(step), i + 1]));
  const markerAt = new Map(
    segments.filter((segment) => segment.remap).map((segment) => [segment.startIndex, segment])
  );

  const currentRows = current.map((step, i): CurrentCompareRow => {
    const to = proposedAt.get(keyOf(step));
    return { step, position: i + 1, movesTo: to === undefined || to === i + 1 ? null : to };
  });

  const proposedRows: ProposedCompareRow[] = [];
  proposed.forEach((step, i) => {
    const segment = markerAt.get(i);
    if (segment) proposedRows.push({ kind: 'remap', segment, before: step });
    const from = currentAt.get(keyOf(step));
    proposedRows.push({
      kind: 'step',
      step,
      position: i + 1,
      from: from === undefined || from === i + 1 ? null : from,
    });
  });
  return { current: currentRows, proposed: proposedRows };
}

/**
 * Whether "Optimize for me" found anything worth previewing. A new order that
 * saves no time and adds no Remap Marker is only a reshuffle, unless the pilot
 * ranked skills by priority: then putting the urgent ones first is the point.
 */
export function optimizeForMeHasGain({
  savedSeconds,
  markers,
  prioritized,
}: {
  savedSeconds: number;
  markers: number;
  prioritized: boolean;
}): boolean {
  return prioritized || markers > 0 || savedSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;
}
