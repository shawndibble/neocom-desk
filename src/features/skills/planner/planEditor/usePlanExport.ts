import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import type { EngineSkill, ScheduledStep } from '@/engine/types';
import { writeToClipboard } from '@/lib/clipboard';
import { downloadCsv } from '@/lib/downloadCsv';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { queueCsvColumns } from '../queueCsv';

/** Export to clipboard and CSV, with the beside-the-button "copied" confirmation. */
export function usePlanExport({
  scheduled,
  engineSkills,
  nameFor,
  userSkillTypeIDs,
}: {
  scheduled: readonly ScheduledStep[];
  engineSkills: ReadonlyMap<number, EngineSkill>;
  nameFor: (skillTypeID: number) => string;
  userSkillTypeIDs: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const [copyConfirm, setCopyConfirm] = useState(false);
  const { show: showCopyConfirm } = useAutoDismiss<boolean>(setCopyConfirm, false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  async function handleExport() {
    const text = exportPlanToClipboard(
      scheduled.map((s) => ({ skillTypeID: s.skillTypeID, level: s.level })),
      engineSkills
    );
    await writeToClipboard(text);
    showCopyConfirm(true);
  }

  function handleExportCsv() {
    downloadCsv('skill-queue', scheduled, queueCsvColumns(t, nameFor, userSkillTypeIDs));
  }

  return { copyConfirm, exportMenuOpen, setExportMenuOpen, handleExport, handleExportCsv };
}
