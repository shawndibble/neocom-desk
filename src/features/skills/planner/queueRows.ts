import type { PlanEntry, ScheduledStep } from '@/engine/types';
import type { QueueEndProjection } from '@/engine/skills/queueStatus';
import { entrySlices } from './entrySlices';
import { buildRows, type PlanRow } from './markers';
import { entryId } from './reorder';

export interface EntryQueueSummary {
  seconds: number;
  cumulativeSeconds: number;
  steps: ScheduledStep[];
  stepIndices: number[];
}

export interface PrereqQueueRow {
  step: ScheduledStep;
  stepIndex: number;
}

export interface EntryQueueInfo {
  summary: EntryQueueSummary;
  prereqRows: PrereqQueueRow[];
}

export function summarizeEntryQueue(
  entries: readonly PlanEntry[],
  entryBoundaries: readonly number[],
  scheduled: readonly ScheduledStep[],
  isKnown: (skillTypeID: number) => boolean
): Map<string, EntryQueueInfo> {
  const result = new Map<string, EntryQueueInfo>();
  const slices = entrySlices(entries, entryBoundaries, scheduled, isKnown);

  entries.forEach((entry, i) => {
    const { start, ownStart, end } = slices[i];
    const carried = start > 0 ? scheduled[start - 1].cumulativeSeconds : 0;
    const own = ownStart === -1 ? [] : scheduled.slice(ownStart, end);
    const prereq = scheduled.slice(start, ownStart === -1 ? end : ownStart);

    result.set(entryId(entry), {
      summary: {
        seconds: own.reduce((sum, s) => sum + s.seconds, 0),
        cumulativeSeconds: end > start ? scheduled[end - 1].cumulativeSeconds : carried,
        steps: own,
        stepIndices: own.map((_, offset) => (ownStart === -1 ? 0 : ownStart) + offset),
      },
      prereqRows: prereq.map((step, offset) => ({ step, stepIndex: start + offset })),
    });
  });
  return result;
}

export interface PinnedInProgressEntry {
  id: string;
  seconds: number;
}

export function pinnedInProgressEntry(
  entries: readonly PlanEntry[],
  projection: Pick<QueueEndProjection, 'queuedLevels' | 'paused'>,
  nowMs: number
): PinnedInProgressEntry | null {
  if (projection.paused) return null;
  const head = projection.queuedLevels[0];
  if (!head?.finish_date) return null;
  const finishMs = Date.parse(head.finish_date);
  if (!Number.isFinite(finishMs)) return null;
  const match = entries.find(
    (e) => e.skillTypeID === head.skill_id && e.targetLevel === head.finished_level
  );
  return match ? { id: entryId(match), seconds: Math.max(0, (finishMs - nowMs) / 1000) } : null;
}

export type MergedRow =
  | { kind: 'marker'; id: string; markerIndex: number }
  | { kind: 'prereq'; id: string; step: ScheduledStep; stepIndex: number }
  | {
      kind: 'entry';
      id: string;
      entry: PlanEntry;
      seconds: number;
      cumulativeSeconds: number;
      steps: ScheduledStep[];
      stepIndices: number[];
    };

const EMPTY_SUMMARY: EntryQueueInfo = {
  summary: { seconds: 0, cumulativeSeconds: 0, steps: [], stepIndices: [] },
  prereqRows: [],
};

export function buildMergedRows(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  entryQueue: ReadonlyMap<string, EntryQueueInfo>,
  precomputedRows?: readonly PlanRow[]
): MergedRow[] {
  const rows: MergedRow[] = [];
  for (const row of precomputedRows ?? buildRows(entries, markers)) {
    if (row.kind === 'marker') {
      rows.push({ kind: 'marker', id: row.id, markerIndex: row.markerIndex });
      continue;
    }
    const info = entryQueue.get(row.id) ?? EMPTY_SUMMARY;
    for (const p of info.prereqRows) {
      rows.push({
        kind: 'prereq',
        id: `prereq-${p.step.skillTypeID}-${p.step.level}`,
        step: p.step,
        stepIndex: p.stepIndex,
      });
    }
    rows.push({
      kind: 'entry',
      id: row.id,
      entry: row.entry,
      seconds: info.summary.seconds,
      cumulativeSeconds: info.summary.cumulativeSeconds,
      steps: info.summary.steps,
      stepIndices: info.summary.stepIndices,
    });
  }
  return rows;
}

export function placeBandHeaders<T>(
  rows: readonly MergedRow[],
  bandsAt: ReadonlyMap<string, T>
): Map<string, T> {
  const placement = new Map<string, T>();
  let runStartId: string | null = null;
  for (const row of rows) {
    if (row.kind === 'prereq') {
      runStartId ??= row.id;
      continue;
    }
    if (row.kind === 'entry') {
      const band = bandsAt.get(row.id);
      if (band) placement.set(runStartId ?? row.id, band);
    }
    runStartId = null;
  }
  return placement;
}
