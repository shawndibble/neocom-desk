import type { PlanEntry, PlanStep } from '@/engine/types';

export interface EntrySlice {
  start: number;
  ownStart: number;
  end: number;
}

export function entrySlices(
  entries: readonly PlanEntry[],
  entryBoundaries: readonly number[],
  steps: readonly PlanStep[],
  isKnown: (skillTypeID: number) => boolean
): EntrySlice[] {
  let previous = 0;
  let boundaryIndex = 0;
  return entries.map((entry) => {
    if (!isKnown(entry.skillTypeID)) {
      return { start: previous, ownStart: -1, end: previous };
    }
    const start = previous;
    const end = entryBoundaries[boundaryIndex++];
    let ownStart = -1;
    for (let i = start; i < end; i++) {
      if (steps[i].skillTypeID === entry.skillTypeID) {
        ownStart = i;
        break;
      }
    }
    previous = end;
    return { start, ownStart, end };
  });
}
