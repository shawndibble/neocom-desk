import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import type { SkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import { writeToClipboard } from '@/lib/clipboard';
import { exportRows, type ExportFormat } from '@/lib/downloadCsv';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { queueCsvColumns, queueCsvRows } from '../queueCsv';

/** Export to clipboard (EVE format) and the queue table (CSV, Excel, Sheets), with the beside-the-button "copied" confirmation. */
export function usePlanExport({
  schedule,
  entries,
  trainedSkills,
  engineSkills,
  nameFor,
  userSkillTypeIDs,
}: {
  schedule: SkillPlanSchedule;
  entries: readonly PlanEntry[];
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  engineSkills: ReadonlyMap<number, EngineSkill>;
  nameFor: (skillTypeID: number) => string;
  userSkillTypeIDs: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const [copyConfirm, setCopyConfirm] = useState(false);
  const { show: showCopyConfirm } = useAutoDismiss<boolean>(setCopyConfirm, false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const { scheduled } = schedule;
  const rows = useMemo(
    () => queueCsvRows(schedule, entries, trainedSkills),
    [schedule, entries, trainedSkills]
  );

  async function handleExport() {
    const text = exportPlanToClipboard(
      scheduled.map((s) => ({ skillTypeID: s.skillTypeID, level: s.level })),
      engineSkills
    );
    await writeToClipboard(text);
    showCopyConfirm(true);
  }

  /** The queue table, in any of the table menus' formats. */
  async function handleExportQueue(format: ExportFormat) {
    await exportRows(
      format,
      'skill-queue',
      rows,
      queueCsvColumns(t, nameFor, userSkillTypeIDs, { schedule, engineSkills })
    );
    if (format === 'clipboard') showCopyConfirm(true);
  }

  return {
    copyConfirm,
    exportMenuOpen,
    setExportMenuOpen,
    handleExport,
    handleExportQueue,
    queueRowCount: rows.length,
  };
}
