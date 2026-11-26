import { arrayMove } from '@dnd-kit/sortable';
import { normalizePlanWithBoundaries } from '@/engine/skills/plan';
import { hasKnownSkill, markerStepIndices, normalizeMarkers } from '@/engine/remapMarkers';
import type { RemapSegment } from '@/engine/optimizer';
import type { Attributes, EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { entryId } from './reorder';

export { markerStepIndices, normalizeMarkers };

const MARKER_ID_PREFIX = 'marker-';

export function markerRowId(index: number): string {
  return `${MARKER_ID_PREFIX}${index}`;
}

export function normalizeMarkerAttributes(
  markers: readonly number[] | undefined,
  attributes: readonly (Attributes | null)[] | undefined,
  entryCount: number
): (Attributes | null)[] {
  const raw = markers ?? [];
  const attrs = attributes ?? [];
  const byPosition = new Map<number, Attributes | null>();
  raw.forEach((m, i) => {
    const position = Math.min(entryCount, Math.max(0, m));
    if (!byPosition.has(position)) byPosition.set(position, attrs[i] ?? null);
  });
  return normalizeMarkers(markers, entryCount).map((position) => byPosition.get(position) ?? null);
}

export type PlanRow =
  | { kind: 'entry'; id: string; entry: PlanEntry }
  | { kind: 'marker'; id: string; markerIndex: number };

export function buildRows(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined
): PlanRow[] {
  const normalized = normalizeMarkers(markers, entries.length);
  const rows: PlanRow[] = [];
  let markerIndex = 0;
  for (let p = 0; p <= entries.length; p++) {
    while (markerIndex < normalized.length && normalized[markerIndex] === p) {
      rows.push({ kind: 'marker', id: markerRowId(markerIndex), markerIndex });
      markerIndex++;
    }
    if (p < entries.length)
      rows.push({ kind: 'entry', id: entryId(entries[p]), entry: entries[p] });
  }
  return rows;
}

export interface RowsToState {
  entries: PlanEntry[];
  markers: number[];
  markerOrder: number[];
}

export function rowsToState(rows: readonly PlanRow[]): RowsToState {
  const entries: PlanEntry[] = [];
  const markers: number[] = [];
  const markerOrder: number[] = [];
  for (const row of rows) {
    if (row.kind === 'entry') entries.push(row.entry);
    else {
      markers.push(entries.length);
      markerOrder.push(row.markerIndex);
    }
  }
  return { entries, markers, markerOrder };
}

export function reorderRows(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  activeId: string,
  overId: string
): RowsToState {
  const rows = buildRows(entries, markers);
  const oldIndex = rows.findIndex((r) => r.id === activeId);
  const newIndex = rows.findIndex((r) => r.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    const normalized = normalizeMarkers(markers, entries.length);
    return {
      entries: [...entries],
      markers: normalized,
      markerOrder: normalized.map((_, i) => i),
    };
  }
  return rowsToState(arrayMove(rows, oldIndex, newIndex));
}

export function segmentsToMarkers(
  entries: readonly PlanEntry[],
  segments: readonly RemapSegment[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): number[] {
  const validIndices: number[] = [];
  const valid: PlanEntry[] = [];
  entries.forEach((e, i) => {
    if (hasKnownSkill(e, skills)) {
      validIndices.push(i);
      valid.push(e);
    }
  });
  const { entryBoundaries } = normalizePlanWithBoundaries(valid, skills, trainedSkills);

  const toEntryPosition = (stepIndex: number): number => {
    const i = entryBoundaries.findIndex((boundary) => boundary > stepIndex);
    return i === -1 ? entries.length : validIndices[i];
  };

  return normalizeMarkers(
    segments.filter((s) => s.remap).map((s) => toEntryPosition(s.startIndex)),
    entries.length
  );
}
