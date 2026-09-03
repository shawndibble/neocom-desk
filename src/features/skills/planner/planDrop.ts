/**
 * What a drag-and-drop on the merged entry list means (#112 rows, CONTEXT.md
 * "Prereq Promotion").
 *
 * Two things live here that markers.ts's `reorderRows` cannot express:
 *
 * 1. **Prereq rows are derived, not stored.** `normalizePlanWithBoundaries`
 *    recomputes them from scratch every render, so a dragged prereq row has
 *    nowhere to persist a position to. Dragging one therefore *promotes* it:
 *    the row becomes a real `PlanEntry` at the drop position, user-owned and
 *    draggable from then on like any other. Its own upstream prerequisites
 *    stay derived — they simply move with it, since the normalizer recurses
 *    into the promoted entry the same way it recursed into its dependent.
 *
 * 2. **A drop the normalizer would silently undo is refused.** Prerequisite
 *    ordering is enforced in `plan.ts` by construction, so dropping a skill
 *    after something that requires it does not produce an error — it produces
 *    a zero-time ghost row while the schedule quietly trains the skill where
 *    it always did. That silent correction is indistinguishable from a bug
 *    from the user's side, so the drop is rejected instead, naming the entry
 *    that has to stay behind it. The check runs the real normalizer over the
 *    candidate order rather than re-deriving prerequisite rules, so levels,
 *    already-trained skills and the cycle guard all behave identically to the
 *    schedule the user is looking at.
 *
 * Pure — no React/DOM — like markers.ts and reorder.ts, so both behaviours are
 * unit-testable without simulating drag events.
 */
import { arrayMove } from '@dnd-kit/sortable';
import { normalizePlanWithBoundaries } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { buildRows, normalizeMarkers, rowsToState, type PlanRow } from './markers';
import type { MergedRow } from './queueRows';
import { entryId } from './reorder';

const PREREQ_ID_PREFIX = 'prereq-';

/**
 * Sortable id for a prereq row. One row per scheduled level, so the level is
 * part of the id — `buildMergedRows` builds these and `parsePrereqRowId` reads
 * them back, and planDrop.test.ts pins the two together against real rows.
 */
export function prereqRowId(skillTypeID: number, level: number): string {
  return `${PREREQ_ID_PREFIX}${skillTypeID}-${level}`;
}

/** The skill/level behind a prereq row id, or null for entry and marker ids. */
export function parsePrereqRowId(id: string): { skillTypeID: number; level: number } | null {
  if (!id.startsWith(PREREQ_ID_PREFIX)) return null;
  const parts = id.slice(PREREQ_ID_PREFIX.length).split('-');
  if (parts.length !== 2) return null;
  const [skillTypeID, level] = parts.map(Number);
  if (!Number.isInteger(skillTypeID) || !Number.isInteger(level)) return null;
  return { skillTypeID, level };
}

/** The persisted shape a drop resolves to. */
export interface PlanDropState {
  entries: PlanEntry[];
  markers: number[];
}

export type PlanDropResult =
  | (PlanDropState & {
      ok: true;
      /** Set when the drag started on a prereq row, so the caller can say what it did. */
      promoted: { skillTypeID: number; level: number } | null;
    })
  | {
      ok: false;
      /** The skill that cannot go there. */
      skillTypeID: number;
      /** The entry that requires it, and so has to stay behind it. */
      blockedBy: number;
    };

/** The entry row a prereq row was inserted for: the next entry row below it. */
function owningEntryRowId(rows: readonly MergedRow[], prereqId: string): string | null {
  const index = rows.findIndex((r) => r.id === prereqId);
  if (index === -1) return null;
  for (let i = index + 1; i < rows.length; i++) {
    if (rows[i].kind === 'entry') return rows[i].id;
  }
  return null;
}

/** Which block a row belongs to: its own id for an entry, its owner's for a prereq row. */
function blockOwnerId(rows: readonly MergedRow[], id: string): string | null {
  return parsePrereqRowId(id) ? owningEntryRowId(rows, id) : id;
}

/**
 * `buildRows` output with the prereq row's promoted entry spliced in where the
 * dimmed row already sat — just ahead of the entry it was pulled in for. Any
 * pre-existing entry for that skill is moved rather than duplicated (one entry
 * per skill; see reorder.ts), keeping the higher of the two target levels.
 */
function withPromotedEntry(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  rows: readonly MergedRow[],
  rowId: string
): { rows: PlanRow[]; index: number; skillTypeID: number; level: number } | null {
  const prereq = parsePrereqRowId(rowId);
  if (!prereq) return null;
  const ownerId = owningEntryRowId(rows, rowId);
  if (ownerId === null) return null;

  const existing = entries.find((e) => e.skillTypeID === prereq.skillTypeID);
  const promoted: PlanEntry = existing
    ? { ...existing, targetLevel: Math.max(existing.targetLevel, prereq.level) }
    : { skillTypeID: prereq.skillTypeID, targetLevel: prereq.level };

  const planRows = buildRows(entries, markers).filter((r) => r.id !== entryId(promoted));
  const index = planRows.findIndex((r) => r.id === ownerId);
  if (index === -1) return null;
  planRows.splice(index, 0, { kind: 'entry', id: entryId(promoted), entry: promoted });
  return { rows: planRows, index, skillTypeID: prereq.skillTypeID, level: prereq.level };
}

/**
 * Promote a prereq row in place — the "Add to plan" affordance, for anyone not
 * reaching for a drag. Legal by construction: the entry lands exactly where
 * the schedule already trains it. Null if `rowId` is not a prereq row of these
 * rows.
 */
export function promotePrereq({
  entries,
  markers,
  rows,
  rowId,
}: {
  entries: readonly PlanEntry[];
  markers: readonly number[] | undefined;
  rows: readonly MergedRow[];
  rowId: string;
}): PlanDropState | null {
  const promoted = withPromotedEntry(entries, markers, rows, rowId);
  return promoted ? rowsToState(promoted.rows) : null;
}

/**
 * The entry that leaves `skillTypeID` with no levels of its own to train, or
 * null if this order is fine. An empty own-range means the schedule already
 * trained the skill for an earlier entry, so the row would render as a
 * zero-time ghost while the plan ignored where the user put it.
 */
function ghostBlocker(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): number | null {
  // Boundaries are indexed over the catalog-known subset, exactly as
  // computeQueue and summarizeEntryQueue index them.
  const valid = entries.filter((e) => skills.has(e.skillTypeID));
  const index = valid.findIndex((e) => e.skillTypeID === skillTypeID);
  if (index === -1) return null;

  let plan;
  try {
    plan = normalizePlanWithBoundaries(valid, skills, trainedSkills);
  } catch {
    // A circular or unknown-skill plan is already broken and already
    // reported by the editor; don't blame this drop for it.
    return null;
  }
  const start = index === 0 ? 0 : plan.entryBoundaries[index - 1];
  const end = plan.entryBoundaries[index];
  for (let i = start; i < end; i++) {
    if (plan.steps[i].skillTypeID === skillTypeID) return null;
  }

  const firstStep = plan.steps.findIndex((s) => s.skillTypeID === skillTypeID);
  // No steps at all means the skill is already trained to this target — an
  // empty row wherever it sits, not an ordering problem this drop created.
  if (firstStep === -1) return null;
  const owner = plan.entryBoundaries.findIndex((boundary) => boundary > firstStep);
  return owner === -1 ? null : valid[owner].skillTypeID;
}

/**
 * Resolve one drag onto the merged row list. `rows` is the list the user
 * actually sees (entries, markers and prereq rows), `entries`/`markers` the
 * persisted state it was built from.
 */
export function planDrop({
  entries,
  markers,
  rows,
  activeId,
  overId,
  skills,
  trainedSkills,
}: {
  entries: readonly PlanEntry[];
  markers: readonly number[] | undefined;
  rows: readonly MergedRow[];
  activeId: string;
  overId: string;
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
}): PlanDropResult {
  const unchanged = (): PlanDropResult => ({
    ok: true,
    entries: [...entries],
    markers: normalizeMarkers(markers, entries.length),
    promoted: null,
  });

  const promotion = withPromotedEntry(entries, markers, rows, activeId);
  if (parsePrereqRowId(activeId) && !promotion) return unchanged();

  const planRows = promotion?.rows ?? buildRows(entries, markers);
  const oldIndex = promotion?.index ?? planRows.findIndex((r) => r.id === activeId);
  if (oldIndex === -1) return unchanged();
  const promoted = promotion
    ? { skillTypeID: promotion.skillTypeID, level: promotion.level }
    : null;

  // Dropped inside its own block (onto the entry it was pulled in for, or a
  // sibling prereq row of that entry): the smallest gesture there is, and the
  // one that means "make this real where it already is". Legal by
  // construction, so it never has to reach the blocker check below.
  if (promotion && blockOwnerId(rows, overId) === blockOwnerId(rows, activeId)) {
    return { ok: true, ...rowsToState(planRows), promoted };
  }

  // A prereq row is not an entry row, so a drop onto one has to resolve to the
  // block it belongs to — otherwise it finds no index and the drag silently
  // does nothing. Landing "where that dimmed row is" means landing just ahead
  // of its entry, which arrayMove only does unadjusted when dragging upwards.
  const overPrereq = parsePrereqRowId(overId);
  const targetId = overPrereq ? owningEntryRowId(rows, overId) : overId;
  if (targetId === null) return unchanged();
  const targetIndex = planRows.findIndex((r) => r.id === targetId);
  if (targetIndex === -1) return unchanged();
  const newIndex =
    overPrereq && oldIndex < targetIndex ? Math.max(oldIndex, targetIndex - 1) : targetIndex;

  const next = rowsToState(
    newIndex === oldIndex ? planRows : arrayMove(planRows, oldIndex, newIndex)
  );

  // Markers carry no prerequisites, so they can go anywhere.
  const dragged =
    promoted?.skillTypeID ?? next.entries.find((e) => entryId(e) === activeId)?.skillTypeID;
  if (dragged === undefined) return { ok: true, ...next, promoted };

  const blockedBy = ghostBlocker(next.entries, dragged, skills, trainedSkills);
  if (blockedBy !== null) return { ok: false, skillTypeID: dragged, blockedBy };
  return { ok: true, ...next, promoted };
}
