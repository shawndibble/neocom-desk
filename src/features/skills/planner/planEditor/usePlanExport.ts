import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import type { EngineSkill, PlanEntry, PlanMilestone, TrainedSkill } from '@/engine/types';
import type { SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { writeToClipboard } from '@/lib/clipboard';
import { useTableExport } from '@/components/ui/useTableExport';
import type { ExportFormat } from '@/lib/downloadCsv';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { queueCsvColumns, queueCsvRows } from '../queueCsv';
import type { PinnedInProgressEntry } from '../queueRows';

/**
 * Export to clipboard (EVE format) and the queue table (`useTableExport`, shown
 * as the menu's Export table submenu), with the beside-the-button "copied" confirmation.
 */
export function usePlanExport({
  schedule,
  entries,
  milestones,
  trainedSkills,
  engineSkills,
  pinnedInProgress,
  loadedAtMs,
  nameFor,
  userSkillTypeIDs,
}: {
  schedule: SkillPlanSchedule;
  entries: readonly PlanEntry[];
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
  const rows = useMemo(
    () =>
      queueCsvRows({
        schedule,
        entries,
        trainedSkills,
        pinned: pinnedInProgress,
        nowMs: loadedAtMs,
        milestones,
      }),
    [schedule, entries, trainedSkills, pinnedInProgress, loadedAtMs, milestones]
  );
  const columns = useMemo(
    () => queueCsvColumns(t, nameFor, userSkillTypeIDs, { schedule, engineSkills }),
    [t, nameFor, userSkillTypeIDs, schedule, engineSkills]
  );
  const tableExport = useTableExport({ surface: 'skill-queue', rows, columns, source: 'rows' });

  async function handleExport() {
    const text = exportPlanToClipboard(
      scheduled.map((s) => ({ skillTypeID: s.skillTypeID, level: s.level })),
      engineSkills
    );
    await writeToClipboard(text);
    showCopyConfirm(true);
  }

  /** A table copy confirms beside the button, as the EVE-format copy does. */
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
