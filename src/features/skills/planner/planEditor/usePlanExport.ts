import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import type { EngineSkill, PlanMilestone, TrainedSkill } from '@/engine/types';
import type { SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { writeToClipboard } from '@/lib/clipboard';
import { useTableExport } from '@/components/ui/useTableExport';
import type { ExportFormat } from '@/lib/downloadCsv';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { queueCsvColumns, queueCsvRows } from '../queueCsv';
import type { MergedRow, PinnedInProgressEntry } from '../queueRows';

export function usePlanExport({
  schedule,
  mergedRows,
  milestones,
  trainedSkills,
  engineSkills,
  pinnedInProgress,
  loadedAtMs,
  nameFor,
  userSkillTypeIDs,
}: {
  schedule: SkillPlanSchedule;
  mergedRows: readonly MergedRow[];
  milestones: readonly PlanMilestone[];
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  engineSkills: ReadonlyMap<number, EngineSkill>;
  pinnedInProgress: PinnedInProgressEntry | null;
  loadedAtMs: number;
  nameFor: (skillTypeID: number) => string;
  userSkillTypeIDs: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const [copyConfirm, setCopyConfirm] = useState(false);
  const { show: showCopyConfirm } = useAutoDismiss<boolean>(setCopyConfirm, false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const { scheduled } = schedule;
  const columns = useMemo(
    () => queueCsvColumns(t, nameFor, userSkillTypeIDs, { schedule, engineSkills }),
    [t, nameFor, userSkillTypeIDs, schedule, engineSkills]
  );
  const tableExport = useTableExport({
    surface: 'skill-queue',
    rows: () =>
      queueCsvRows({
        mergedRows,
        schedule,
        trainedSkills,
        pinned: pinnedInProgress,
        nowMs: loadedAtMs,
        milestones,
      }),
    columns,
    source: 'rows',
  });

  async function handleExport() {
    const text = exportPlanToClipboard(
      scheduled.map((s) => ({ skillTypeID: s.skillTypeID, level: s.level })),
      engineSkills
    );
    await writeToClipboard(text);
    showCopyConfirm(true);
  }

  function handleTableDone(format: ExportFormat) {
    if (format === 'clipboard') showCopyConfirm(true);
  }

  return {
    copyConfirm,
    exportMenuOpen,
    setExportMenuOpen,
    handleExport,
    handleTableDone,
    tableExport,
  };
}
