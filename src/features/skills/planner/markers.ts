/**
 * Remap Marker (CONTEXT.md) helpers: a marker is a user-placed row in the
 * entry list marking where the character will remap attributes.
 *
 * Persistence: `SkillPlanRecord.markers?: number[]` — entry-list positions,
 * where position p means "remap before entries[p]" (p === entries.length puts
 * the marker after the last entry). Positions are normalized (clamped, sorted,
 * deduped) on every read, so stale positions from removed entries degrade
 * gracefully instead of corrupting the row list.
 *
 * Pure and dependency-free (besides @dnd-kit's arrayMove), like reorder.ts,
 * so drag interactions are unit-testable without simulating drag events.
 */
import { arrayMove } from '@dnd-kit/sortable';
import { normalizePlan } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { entryId } from './reorder';

const MARKER_ID_PREFIX = 'marker-';

/** Sortable id for the i-th marker (in normalized order). */
export function markerRowId(index: number): string {
  return `${MARKER_ID_PREFIX}${index}`;
}

/** Clamp to [0, entryCount], sort ascending, dedupe. */
export function normalizeMarkers(
  markers: readonly number[] | undefined,
  entryCount: number
): number[] {
  return [...new Set((markers ?? []).map((m) => Math.min(entryCount, Math.max(0, m))))].sort(
    (a, b) => a - b
  );
}

export type PlanRow =
  | { kind: 'entry'; id: string; entry: PlanEntry }
  | { kind: 'marker'; id: string; markerIndex: number };

/** Entry rows with marker rows interleaved before the entry at their position. */
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

/**
 * Derive the persisted shape back out of a (reordered) row list. Exported for
 * planDrop.ts, which builds row lists this module's own drags never produce —
 * one with a promoted prereq entry spliced in.
 */
export function rowsToState(rows: readonly PlanRow[]): { entries: PlanEntry[]; markers: number[] } {
  const entries: PlanEntry[] = [];
  const markers: number[] = [];
  for (const row of rows) {
    if (row.kind === 'entry') entries.push(row.entry);
    else markers.push(entries.length);
  }
  return { entries, markers };
}

/**
 * Drag-and-drop over the combined entry+marker list: move the row with
 * sortable id `activeId` to sit at `overId`, then re-derive both the entry
 * order and the marker positions.
 *
 * The prereq-blind primitive. The editor's drag now goes through
 * `planDrop.ts` instead, which also understands prereq rows (dropping onto
 * one, and dragging one to promote it) and refuses an order the normalizer
 * would silently undo. This stays because it is the engine-free half of that
 * — the same reason `reorder.ts`'s helpers stay pure — and because deleting a
 * shared export while five sibling branches are in flight buys nothing.
 */
export function reorderRows(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  activeId: string,
  overId: string
): { entries: PlanEntry[]; markers: number[] } {
  const rows = buildRows(entries, markers);
  const oldIndex = rows.findIndex((r) => r.id === activeId);
  const newIndex = rows.findIndex((r) => r.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return { entries: [...entries], markers: normalizeMarkers(markers, entries.length) };
  }
  return rowsToState(arrayMove(rows, oldIndex, newIndex));
}

/** "Add remap marker": append after the last entry (the user drags it up). */
export function addMarker(markers: readonly number[] | undefined, entryCount: number): number[] {
  return normalizeMarkers([...(markers ?? []), entryCount], entryCount);
}

/** Remove the marker at `markerIndex` (an index into the normalized list). */
export function removeMarker(
  markers: readonly number[] | undefined,
  markerIndex: number,
  entryCount: number
): number[] {
  const normalized = normalizeMarkers(markers, entryCount);
  normalized.splice(markerIndex, 1);
  return normalized;
}

/**
 * Keep markers anchored when the entry at `entryIndex` is removed: markers
 * after it shift one position left; markers before it stay put.
 */
export function markersAfterEntryRemoval(
  markers: readonly number[] | undefined,
  entryIndex: number,
  entryCountBefore: number
): number[] {
  if (entryIndex < 0) return normalizeMarkers(markers, entryCountBefore);
  return normalizeMarkers(
    (markers ?? []).map((m) => (m > entryIndex ? m - 1 : m)),
    entryCountBefore - 1
  );
}

/**
 * Marker <-> step mapping: a marker at entry-list position p means "remap
 * before entries[p]", which in the computed queue is the step right after
 * everything entries[0..p) expand to. normalizePlan builds steps entry by
 * entry (prereqs recursively, already-planned/trained levels skipped), so the
 * expansion of a strict entry prefix IS a strict step prefix of the full
 * queue — the marker's step index is simply that prefix's length. Entries
 * missing from the catalog are dropped first, mirroring the computed queue's
 * own filtering.
 */
export function markerStepIndices(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): number[] {
  const valid = (list: readonly PlanEntry[]) => list.filter((e) => skills.has(e.skillTypeID));
  return normalizeMarkers(markers, entries.length).map(
    (position) => normalizePlan(valid(entries.slice(0, position)), skills, trainedSkills).length
  );
}
