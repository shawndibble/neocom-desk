import type { RemapSegment } from '@/engine/optimizer';
import type { PlanStep } from '@/engine/types';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from './planHeaderStats';

export interface CurrentCompareRow {
  step: PlanStep;
  position: number;
  movesTo: number | null;
}

export type ProposedCompareRow =
  | {
      kind: 'step';
      step: PlanStep;
      position: number;
      from: number | null;
    }
  | { kind: 'remap'; segment: RemapSegment; before: PlanStep };

const keyOf = (step: PlanStep) => `${step.skillTypeID}:${step.level}`;

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
