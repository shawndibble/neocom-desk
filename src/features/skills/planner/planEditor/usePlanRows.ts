import { useMemo } from 'react';
import type { SkillPlanRecord } from '@/db';
import type { SkillCatalog } from '../../skillMap';
import { attributePairBandStarts } from '../attributePairBands';
import { bandStarts, meaningfulBandStarts } from '../bands';
import type { BandInfo } from '../entryList/BandHeader';
import type { GroupingMode } from '../groupingMode';
import { buildRows } from '../markers';
import { buildMergedRows, placeBandHeaders, summarizeEntryQueue } from '../queueRows';
import type { PlanScheduleResult } from './usePlanSchedule';

/** The entry list's rows: entries, dimmed prereqs and markers merged in order, plus the band header each row opens. */
export function usePlanRows({
  plan,
  schedule,
  catalog,
  groupingMode,
}: {
  plan: SkillPlanRecord;
  schedule: PlanScheduleResult;
  catalog: SkillCatalog;
  groupingMode: GroupingMode;
}) {
  const { scheduled, entryBoundaries, priorityMap } = schedule;
  // #112: merge "Your entries" and the computed queue into one row list —
  // one row per entry (own aggregated per-level/cumulative time) plus dimmed
  // prereq rows positioned just ahead of the entry that needed them.
  const entryQueue = useMemo(
    () => summarizeEntryQueue(plan.entries, entryBoundaries, scheduled, schedule.isKnownSkill),
    [plan.entries, entryBoundaries, scheduled, schedule.isKnownSkill]
  );
  // Built once and reused by both mergedRows and bandsAt below (#408: the
  // two used to each call buildRows independently over the same
  // entries/markers, a duplicate pass on every render).
  const rows = useMemo(() => buildRows(plan.entries, plan.markers), [plan.entries, plan.markers]);
  const mergedRows = useMemo(
    () => buildMergedRows(plan.entries, plan.markers, entryQueue, rows),
    [plan.entries, plan.markers, entryQueue, rows]
  );
  const bandsAt = useMemo<ReadonlyMap<string, BandInfo>>(() => {
    if (groupingMode === 'attributePair') {
      const placed = placeBandHeaders(
        mergedRows,
        attributePairBandStarts(rows, catalog.engineSkills)
      );
      return new Map(
        [...placed].map(([id, pair]) => [id, { kind: 'attributePair', ...pair } as const])
      );
    }
    const placed = placeBandHeaders(
      mergedRows,
      meaningfulBandStarts(bandStarts(rows, priorityMap))
    );
    return new Map(
      [...placed].map(([id, priority]) => [id, { kind: 'priority', priority } as const])
    );
  }, [groupingMode, mergedRows, rows, priorityMap, catalog.engineSkills]);

  return { mergedRows, bandsAt };
}
