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
import { normalizePlan, normalizePlanWithBoundaries } from '@/engine/plan';
import type { RemapSegment } from '@/engine/optimizer';
import type { Attributes, EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
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

/**
 * `SkillPlanRecord.markerAttributes?`: the user's manually-set target
 * attributes for a marker (set via the Remap Marker modal), addressed by the
 * same ordinal as `markerRowId`/`onRemoveMarker`/`markerAttributesFor` — the
 * app's one convention for naming "which marker", rather than a second
 * identity scheme keyed by position. `null` (not a missing array slot) marks
 * "no override" — every writer emits a dense array the same length as the
 * normalized markers, which is what keeps Firestore's rejected `undefined`
 * out of it, same reasoning as `PlanBooster`'s fields.
 *
 * Aligned to `normalizeMarkers`' own output: entry i of the result is the
 * override for the marker now at `normalizeMarkers(markers, entryCount)[i]`.
 * When two raw positions collapse onto the same normalized slot (entry
 * removal can do this — see `markerAttributesAfterEntryRemoval`), the first
 * one's override survives, the same "first write wins" a `Set` gives
 * `normalizeMarkers` for the position itself.
 */
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

/** `rowsToState`'s result: the persisted entry/marker positions, plus `markerOrder` (see below). */
export interface RowsToState {
  entries: PlanEntry[];
  markers: number[];
  /**
   * For each marker in `markers` (same order), the ordinal index it had in
   * the marker list `buildRows` assigned `row.markerIndex` from — identity
   * ([0, 1, 2, ...]) unless the drag reordered two markers relative to each
   * other, the only way a marker's ordinal can change (an entry moving past
   * a marker changes the marker's *position*, never its ordinal). A caller
   * carrying per-marker data addressed by ordinal (manual remap attributes)
   * uses this to move that data along with the marker it belongs to:
   * `newMarkerAttributes = markerOrder.map((oldOrdinal) => oldMarkerAttributes[oldOrdinal])`.
   */
  markerOrder: number[];
}

/**
 * Derive the persisted shape back out of a (reordered) row list. Exported for
 * planDrop.ts, which builds row lists this module's own drags never produce —
 * one with a promoted prereq entry spliced in.
 */
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

/** "Add remap marker": append after the last entry (the user drags it up). */
export function addMarker(markers: readonly number[] | undefined, entryCount: number): number[] {
  return normalizeMarkers([...(markers ?? []), entryCount], entryCount);
}

/** `addMarker`'s companion: the newly appended marker gets no override. */
export function addMarkerAttributes(
  markers: readonly number[] | undefined,
  attributes: readonly (Attributes | null)[] | undefined,
  entryCount: number
): (Attributes | null)[] {
  return normalizeMarkerAttributes(
    [...(markers ?? []), entryCount],
    [...(attributes ?? []), null],
    entryCount
  );
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

/** `removeMarker`'s companion: drop the override at the same normalized index. */
export function removeMarkerAttributes(
  markers: readonly number[] | undefined,
  attributes: readonly (Attributes | null)[] | undefined,
  markerIndex: number,
  entryCount: number
): (Attributes | null)[] {
  const normalized = normalizeMarkerAttributes(markers, attributes, entryCount);
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
 * `markersAfterEntryRemoval`'s companion. Removing an entry can make two
 * markers land on the same shifted position — `normalizeMarkerAttributes`
 * then keeps the earlier one's override, exactly like `markersAfterEntryRemoval`
 * itself collapses the two positions into one marker.
 */
export function markerAttributesAfterEntryRemoval(
  markers: readonly number[] | undefined,
  attributes: readonly (Attributes | null)[] | undefined,
  entryIndex: number,
  entryCountBefore: number
): (Attributes | null)[] {
  if (entryIndex < 0) return normalizeMarkerAttributes(markers, attributes, entryCountBefore);
  const shifted = (markers ?? []).map((m) => (m > entryIndex ? m - 1 : m));
  return normalizeMarkerAttributes(shifted, attributes, entryCountBefore - 1);
}

/** An entry whose skill is missing from the catalog contributes no step — the same filter `normalizePlan`/computeQueue apply. Shared so markerStepIndices and segmentsToMarkers can't drift on what "missing from the catalog" means. */
function hasKnownSkill(entry: PlanEntry, skills: ReadonlyMap<number, EngineSkill>): boolean {
  return skills.has(entry.skillTypeID);
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
  const valid = (list: readonly PlanEntry[]) => list.filter((e) => hasKnownSkill(e, skills));
  return normalizeMarkers(markers, entries.length).map(
    (position) => normalizePlan(valid(entries.slice(0, position)), skills, trainedSkills).length
  );
}

/**
 * Inverse of markerStepIndices: turn "Optimize remaps"' free-search
 * RemapSegments (which cut at step indices, wherever an attribute-pair run
 * changes) into entry-list marker positions, so a search result can be
 * turned into actual, draggable Remap Markers with one click.
 *
 * `normalizePlanWithBoundaries` gives entryBoundaries[i] = step count after
 * entries[0..i] inclusive, keyed by position in the catalog-filtered entry
 * list (not the raw one) — validIndices maps back to the caller's real
 * positions the same way `valid()`/markerStepIndices does.
 *
 * A run boundary is not always an entry boundary: an entry whose prereq
 * chain touches a different attribute pair than the entry's own skill
 * expands to steps from two different runs, so a segment can start strictly
 * inside one entry's contributed range. That step index cannot be
 * represented as an entry-list position without splitting the entry, so it
 * snaps to the position right before the whole straddling entry (the first
 * entry boundary strictly past the target step).
 */
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
