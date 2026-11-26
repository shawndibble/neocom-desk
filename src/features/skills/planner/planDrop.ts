import { arrayMove } from '@dnd-kit/sortable';
import { normalizePlanWithBoundaries } from '@/engine/skills/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { entrySlices } from './entrySlices';
import { buildRows, normalizeMarkers, rowsToState, type PlanRow } from './markers';
import type { MergedRow } from './queueRows';
import { entryId } from './reorder';

const PREREQ_ID_PREFIX = 'prereq-';

export function prereqRowId(skillTypeID: number, level: number): string {
  return `${PREREQ_ID_PREFIX}${skillTypeID}-${level}`;
}

export function parsePrereqRowId(id: string): { skillTypeID: number; level: number } | null {
  if (!id.startsWith(PREREQ_ID_PREFIX)) return null;
  const parts = id.slice(PREREQ_ID_PREFIX.length).split('-');
  if (parts.length !== 2) return null;
  const [skillTypeID, level] = parts.map(Number);
  if (!Number.isInteger(skillTypeID) || !Number.isInteger(level)) return null;
  return { skillTypeID, level };
}

export interface PlanDropState {
  entries: PlanEntry[];
  markers: number[];
  markerOrder: number[];
}

export type PlanDropResult =
  | (PlanDropState & {
      ok: true;
      promoted: { skillTypeID: number; level: number } | null;
    })
  | {
      ok: false;
      skillTypeID: number;
      targetLevel: number;
      blockedBy: number;
      blockedByLevel: number;
    };

interface GhostEntry {
  skillTypeID: number;
  targetLevel: number;
  blockedBy: number;
  blockedByLevel: number;
}

function owningEntryRowId(rows: readonly MergedRow[], prereqId: string): string | null {
  const index = rows.findIndex((r) => r.id === prereqId);
  if (index === -1) return null;
  for (let i = index + 1; i < rows.length; i++) {
    if (rows[i].kind === 'entry') return rows[i].id;
  }
  return null;
}

function blockOwnerId(rows: readonly MergedRow[], id: string): string | null {
  return parsePrereqRowId(id) ? owningEntryRowId(rows, id) : id;
}

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

  const sibling = entries.find((e) => e.skillTypeID === prereq.skillTypeID);
  const promoted: PlanEntry = {
    skillTypeID: prereq.skillTypeID,
    targetLevel: prereq.level,
    ...(sibling?.priority ? { priority: sibling.priority } : {}),
  };

  const planRows = buildRows(entries, markers).filter((r) => r.id !== entryId(promoted));
  const index = planRows.findIndex((r) => r.id === ownerId);
  if (index === -1) return null;
  planRows.splice(index, 0, { kind: 'entry', id: entryId(promoted), entry: promoted });
  return { rows: planRows, index, skillTypeID: prereq.skillTypeID, level: prereq.level };
}

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

function ghostEntries(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): Map<string, GhostEntry> {
  const ghosts = new Map<string, GhostEntry>();
  const isKnown = (skillTypeID: number) => skills.has(skillTypeID);
  const valid = entries.filter((e) => isKnown(e.skillTypeID));

  let plan;
  try {
    plan = normalizePlanWithBoundaries(valid, skills, trainedSkills);
  } catch {
    return ghosts;
  }

  entrySlices(entries, plan.entryBoundaries, plan.steps, isKnown).forEach((slice, index) => {
    const entry = entries[index];
    if (!isKnown(entry.skillTypeID) || slice.ownStart !== -1) return;

    const firstStep = plan.steps.findIndex((s) => s.skillTypeID === entry.skillTypeID);
    if (firstStep === -1) return;
    const owner = plan.entryBoundaries.findIndex((boundary) => boundary > firstStep);
    if (owner === -1) return;
    ghosts.set(entryId(entry), {
      skillTypeID: entry.skillTypeID,
      targetLevel: entry.targetLevel,
      blockedBy: valid[owner].skillTypeID,
      blockedByLevel: valid[owner].targetLevel,
    });
  });
  return ghosts;
}

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
  const unchanged = (): PlanDropResult => {
    const normalized = normalizeMarkers(markers, entries.length);
    return {
      ok: true,
      entries: [...entries],
      markers: normalized,
      markerOrder: normalized.map((_, i) => i),
      promoted: null,
    };
  };

  const promotion = withPromotedEntry(entries, markers, rows, activeId);
  if (parsePrereqRowId(activeId) && !promotion) return unchanged();

  const planRows = promotion?.rows ?? buildRows(entries, markers);
  const oldIndex = promotion?.index ?? planRows.findIndex((r) => r.id === activeId);
  if (oldIndex === -1) return unchanged();
  const promoted = promotion
    ? { skillTypeID: promotion.skillTypeID, level: promotion.level }
    : null;

  if (promotion && blockOwnerId(rows, overId) === blockOwnerId(rows, activeId)) {
    return { ok: true, ...rowsToState(planRows), promoted };
  }

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

  if (!promoted && !next.entries.some((e) => entryId(e) === activeId)) {
    return { ok: true, ...next, promoted };
  }

  const before = ghostEntries(entries, skills, trainedSkills);
  for (const [id, ghost] of ghostEntries(next.entries, skills, trainedSkills)) {
    if (!before.has(id)) return { ok: false, ...ghost };
  }
  return { ok: true, ...next, promoted };
}
