import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { parseSkillQueue } from '@/engine/skills/queueImport';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { loadCharacterSkillQueue } from '../../data';
import { importOutcome, type ClipboardImportPreview } from '../clipboardImport';
import { previewImportFile, previewImportText } from '../importPreview';
import { appendedCountMessage } from '../optimizeHelpers';
import { dedupeEntries } from '../reorder';
import { appendImport, replaceWithImport, type SkillPlanEditable } from '../skillPlanEdit';
import { useScopedState } from '../useScopedState';
import type { PlanEditorProps } from './types';

export function usePlanImport({
  characterId,
  planId,
  planEntryCount,
  editable,
  trainedSkills,
  pastedPlanText,
  onUpdate,
}: {
  characterId: number;
  planId: string;
  planEntryCount: number;
  editable: SkillPlanEditable;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  pastedPlanText: string | undefined;
  onUpdate: PlanEditorProps['onUpdate'];
}) {
  const { t } = useTranslation();
  const [importSeed, setImportSeed] = useState(pastedPlanText ?? null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const openImportDialogAfterMenuRef = useRef(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ClipboardImportPreview | undefined>();
  const [importConfirm, setImportConfirm] = useState<string | null>(null);
  const { show: showImportConfirm, cancel: cancelImportConfirm } = useAutoDismiss<string | null>(
    setImportConfirm,
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingQueueImport, setPendingQueueImport] = useScopedState<PlanEntry[]>([planId]);
  const [queueImporting, setQueueImporting] = useState(false);
  const currentPlanIdRef = useRef(planId);
  useLayoutEffect(() => {
    currentPlanIdRef.current = planId;
  });
  const [undoImport, setUndoImport] = useScopedState<Required<SkillPlanEditable>>([planId]);

  async function handleImport() {
    if (queueImporting) return;
    setQueueImporting(true);
    setImportError(null);
    const requestedPlanId = planId;
    try {
      const result = await loadCharacterSkillQueue(characterId);
      if (currentPlanIdRef.current !== requestedPlanId) return;
      if (!result) return;
      const parsed = dedupeEntries(parseSkillQueue(result.data));
      if (parsed.length === 0) {
        setImportError(t('plans.importQueueEmpty'));
        return;
      }
      if (planEntryCount === 0) {
        onUpdate({ entries: parsed });
        return;
      }
      setPendingQueueImport(parsed);
    } catch (err) {
      setImportError(
        t('plans.importError', { message: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setQueueImporting(false);
    }
  }

  function confirmQueueImportAppend() {
    if (!pendingQueueImport) return;
    const parsed = pendingQueueImport;
    setUndoImport(null);
    onUpdate(appendImport(editable, parsed));
    showImportConfirm(appendedCountMessage(t, trainedSkills, parsed), 4000);
    setPendingQueueImport(null);
  }

  function applyTextImport(entries: PlanEntry[]) {
    setUndoImport({
      entries: editable.entries,
      markers: editable.markers ?? [],
      markerAttributes: editable.markerAttributes ?? [],
    });
    onUpdate(appendImport(editable, entries));
    showImportConfirm(appendedCountMessage(t, trainedSkills, entries), 10000);
    setImportOpen(false);
    setImportSeed(null);
    setImportPreview(undefined);
  }

  function replaceTextImport(entries: PlanEntry[]) {
    const { patch, undo } = replaceWithImport(editable, entries);
    setUndoImport(undo);
    onUpdate(patch);
    showImportConfirm(t('plans.importTextReplaced'), 10000);
    closeImportDialog();
  }

  const applyTextImportRef = useRef(applyTextImport);
  useEffect(() => {
    applyTextImportRef.current = applyTextImport;
  });

  async function importWithoutDialog(previewing: Promise<ClipboardImportPreview>, openOn?: string) {
    let result: ClipboardImportPreview;
    try {
      result = await previewing;
    } catch {
      setImportSeed(openOn ?? null);
      setImportOpen(true);
      return;
    }
    if (importOutcome(result) === 'apply') {
      applyTextImportRef.current(result.entries);
      return;
    }
    setImportSeed(openOn ?? null);
    setImportPreview(result);
    setImportOpen(true);
  }

  const seedRef = useRef<string | null>(null);
  useEffect(() => {
    if (importSeed === null || seedRef.current === importSeed) return;
    seedRef.current = importSeed;
    void importWithoutDialog(previewImportText(importSeed), importSeed);
  }, [importSeed]);

  function handleEditorDrop(e: DragEvent<HTMLDivElement>) {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    void importWithoutDialog(previewImportFile(file));
  }

  function confirmQueueImportReplace() {
    if (!pendingQueueImport) return;
    const { patch, undo } = replaceWithImport(editable, pendingQueueImport);
    setUndoImport(undo);
    onUpdate(patch);
    showImportConfirm(t('plans.importQueueReplaced'), 10000);
    setPendingQueueImport(null);
  }

  function undoQueueImportReplace() {
    if (!undoImport) return;
    cancelImportConfirm();
    onUpdate(undoImport);
    setUndoImport(null);
    setImportConfirm(null);
  }

  function closeImportDialog() {
    setImportOpen(false);
    setImportSeed(null);
    setImportPreview(undefined);
  }

  return {
    importSeed,
    importMenuOpen,
    setImportMenuOpen,
    openImportDialogAfterMenuRef,
    importOpen,
    setImportOpen,
    importPreview,
    importConfirm,
    importError,
    pendingQueueImport,
    setPendingQueueImport,
    queueImporting,
    undoImport,
    handleImport,
    confirmQueueImportAppend,
    confirmQueueImportReplace,
    undoQueueImportReplace,
    applyTextImport,
    replaceTextImport,
    closeImportDialog,
    handleEditorDrop,
  };
}
