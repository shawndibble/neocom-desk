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
  const entryQueue = useMemo(
    () => summarizeEntryQueue(plan.entries, entryBoundaries, scheduled, schedule.isKnownSkill),
    [plan.entries, entryBoundaries, scheduled, schedule.isKnownSkill]
  );
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
