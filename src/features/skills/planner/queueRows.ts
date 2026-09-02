/**
 * Merge a plan's entries with its computed queue into one row list (#112):
 * one row per user entry (own aggregated per-level/cumulative time), plus
 * dimmed prereq rows for any scheduled steps that entry's expansion needed
 * but the user didn't add directly. Pure — no React/DOM — like markers.ts
 * and bands.ts, which this composes with (entry/marker row ids match
 * buildRows exactly, so bandStarts keeps working unmodified against those).
 */
import type { PlanEntry, ScheduledStep } from '@/engine/types';
import { buildRows } from './markers';

export interface EntryQueueSummary {
  /** Sum of `seconds` across this entry's own (non-prereq) scheduled steps. */
  seconds: number;
  /** `cumulativeSeconds` of the last step in this entry's range, carried forward unchanged if the range was empty. */
  cumulativeSeconds: number;
  /** Indices into `scheduled` this entry's own steps occupy (for booster-mark lookups). */
  stepIndices: number[];
}

export interface PrereqQueueRow {
  step: ScheduledStep;
  stepIndex: number;
}

export interface EntryQueueInfo {
  summary: EntryQueueSummary;
  /** Leading steps in this entry's range belonging to a different skill — prereqs normalizePlan inserted just ahead of it. */
  prereqRows: PrereqQueueRow[];
}

/**
 * Zip entries + entryBoundaries (from normalizePlanWithBoundaries, computed
 * over the catalog-known subset only) + scheduled into one lookup keyed by
 * skillTypeID. Entries unknown to the catalog consume no boundary and
 * contribute zero time, carrying the previous entry's cumulative forward
 * (matching computeQueue's own validEntries filtering).
 */
export function summarizeEntryQueue(
  entries: readonly PlanEntry[],
  entryBoundaries: readonly number[],
  scheduled: readonly ScheduledStep[],
  isKnown: (skillTypeID: number) => boolean
): Map<number, EntryQueueInfo> {
  const result = new Map<number, EntryQueueInfo>();
  let prevBoundary = 0;
  let boundaryIndex = 0;
  const carriedCumulative = () =>
    prevBoundary > 0 ? scheduled[prevBoundary - 1].cumulativeSeconds : 0;

  for (const entry of entries) {
    if (!isKnown(entry.skillTypeID)) {
      result.set(entry.skillTypeID, {
        summary: { seconds: 0, cumulativeSeconds: carriedCumulative(), stepIndices: [] },
        prereqRows: [],
      });
      continue;
    }

    const boundary = entryBoundaries[boundaryIndex++];
    const range = scheduled.slice(prevBoundary, boundary);
    const ownStart = range.findIndex((s) => s.skillTypeID === entry.skillTypeID);
    const own = ownStart === -1 ? [] : range.slice(ownStart);
    const prereq = ownStart === -1 ? range : range.slice(0, ownStart);
    const seconds = own.reduce((sum, s) => sum + s.seconds, 0);
    const cumulativeSeconds =
      range.length > 0 ? range[range.length - 1].cumulativeSeconds : carriedCumulative();
    const ownOffset = prevBoundary + (ownStart === -1 ? range.length : ownStart);

    result.set(entry.skillTypeID, {
      summary: {
        seconds,
        cumulativeSeconds,
        stepIndices: own.map((_, i) => ownOffset + i),
      },
      prereqRows: prereq.map((step, i) => ({ step, stepIndex: prevBoundary + i })),
    });
    prevBoundary = boundary;
  }
  return result;
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
      stepIndices: number[];
    };

const EMPTY_SUMMARY: EntryQueueInfo = {
  summary: { seconds: 0, cumulativeSeconds: 0, stepIndices: [] },
  prereqRows: [],
};

/** Entry+marker interleave (buildRows) with each entry's prereq rows expanded ahead of it. */
export function buildMergedRows(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  entryQueue: ReadonlyMap<number, EntryQueueInfo>
): MergedRow[] {
  const rows: MergedRow[] = [];
  for (const row of buildRows(entries, markers)) {
    if (row.kind === 'marker') {
      rows.push({ kind: 'marker', id: row.id, markerIndex: row.markerIndex });
      continue;
    }
    const info = entryQueue.get(row.entry.skillTypeID) ?? EMPTY_SUMMARY;
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
      stepIndices: info.summary.stepIndices,
    });
  }
  return rows;
}

/**
 * Re-key bandsAt (keyed by an entry's own row id, from bandStarts or
 * attributePairBandStarts) so a band header renders before the FIRST row of
 * that entry's merged block — its leading prereq rows, if any, rather than
 * landing between them and the entry row itself. Generic over the band value
 * (priority or attribute pair) since the re-keying logic has nothing
 * priority-specific in it.
 */
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
