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

/**
 * Importing into the plan: the in-game queue (Append / Replace, with Undo), pasted or dropped
 * skill plan text and files, and the dialog that opens when one needs a look before applying.
 */
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
  // What a pasted or dropped import found when it needs a look before applying.
  const [importPreview, setImportPreview] = useState<ClipboardImportPreview | undefined>();
  const [importConfirm, setImportConfirm] = useState<string | null>(null);
  // `cancel` covers the early-cancel-on-Undo case below; `show` supersedes a
  // pending confirmation rather than racing it (Append's 4s vs. Replace's
  // 10s, #1402) — the same guarantee `useAutoDismiss` gives every other
  // beside-the-button confirmation in this file.
  const { show: showImportConfirm, cancel: cancelImportConfirm } = useAutoDismiss<string | null>(
    setImportConfirm,
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  // A queue import parsed on a non-empty plan (#1402): held until the user
  // picks Append or Replace on the choice Modal (`PlanImportDialogs`). Scoped to plan.id,
  // same as undoImport below — PlanEditor doesn't remount on a plan
  // switch, so without that the Modal could stay open across one.
  const [pendingQueueImport, setPendingQueueImport] = useScopedState<PlanEntry[]>([planId]);
  // Whether a queue fetch is in flight — disables the Import button so a
  // second click can't race the first (#1402).
  const [queueImporting, setQueueImporting] = useState(false);
  // Read inside handleImport's async continuation after an `await`, where the
  // `plan` captured by that closure is whatever it was at call time and never
  // changes — only a ref kept live across every render can tell that call
  // apart from a plan switch that happened while it was in flight (#1402).
  const currentPlanIdRef = useRef(planId);
  useLayoutEffect(() => {
    currentPlanIdRef.current = planId;
  });
  // A snapshot taken just before a Replace, for the Undo beside its
  // confirmation — scoped to plan.id so switching plans can't apply an undo
  // meant for a different one (#1402).
  const [undoImport, setUndoImport] = useScopedState<Required<SkillPlanEditable>>([planId]);

  async function handleImport() {
    if (queueImporting) return;
    setQueueImporting(true);
    setImportError(null);
    // Compared against currentPlanIdRef once the fetch resolves: a plan
    // switch mid-fetch means this result belongs to neither plan, so it's
    // dropped rather than applied to whichever plan is now current (#1402).
    const requestedPlanId = planId;
    try {
      const result = await loadCharacterSkillQueue(characterId);
      if (currentPlanIdRef.current !== requestedPlanId) return;
      if (!result) return;
      const parsed = dedupeEntries(parseSkillQueue(result.data));
      // An empty in-game queue must never wipe the plan (#1402) — it parses
      // to `[]` the same as a genuinely empty import, so this has to be
      // caught before the "empty plan" fast path below would otherwise apply
      // it as a no-op-looking "import".
      if (parsed.length === 0) {
        setImportError(t('plans.importQueueEmpty'));
        return;
      }
      // An empty plan has nothing to lose, so it goes in with no prompt —
      // the choice Modal (`PlanImportDialogs`) exists only to protect entries already there.
      if (planEntryCount === 0) {
        onUpdate({ entries: parsed });
        return;
      }
      setPendingQueueImport(parsed);
    } catch (err) {
      // BUG #3: malformed/corrupted queue data (parseSkillQueue validates
      // and throws) must surface as a visible, i18n'd note — not an
      // unhandled rejection swallowed by the `void handleImport()` caller.
      setImportError(
        t('plans.importError', { message: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setQueueImporting(false);
    }
  }

  /** Append choice on the queue-import Modal (#1402): same merge rule clipboard import uses. */
  function confirmQueueImportAppend() {
    if (!pendingQueueImport) return;
    const parsed = pendingQueueImport;
    // A pending Undo describes a Replace this Append doesn't touch, but
    // showing it beside an unrelated Append confirmation would let it revert
    // this (and anything since) instead of just the Replace it was for.
    setUndoImport(null);
    onUpdate(appendImport(editable, parsed));
    showImportConfirm(appendedCountMessage(t, trainedSkills, parsed), 4000);
    setPendingQueueImport(null);
  }

  /**
   * Clipboard/file import's commit: append, with an Undo beside the confirmation
   * since nothing was previewed first. The snapshot is the same one Replace
   * takes, so one Undo handler serves both.
   */
  function applyTextImport(entries: PlanEntry[]) {
    setUndoImport({
      entries: editable.entries,
      markers: editable.markers ?? [],
      markerAttributes: editable.markerAttributes ?? [],
    });
    onUpdate(appendImport(editable, entries));
    // Long enough to use the Undo it carries, like Replace's.
    showImportConfirm(appendedCountMessage(t, trainedSkills, entries), 10000);
    setImportOpen(false);
    setImportSeed(null);
    setImportPreview(undefined);
  }

  const applyTextImportRef = useRef(applyTextImport);
  useEffect(() => {
    applyTextImportRef.current = applyTextImport;
  });

  /**
   * A pasted skill plan or a dropped plan file: applied without a dialog when
   * every line parsed, otherwise the dialog opens on what was and wasn't read.
   */
  async function importWithoutDialog(previewing: Promise<ClipboardImportPreview>, openOn?: string) {
    let result: ClipboardImportPreview;
    try {
      result = await previewing;
    } catch {
      // The catalogs would not load: open the dialog on the text so Import can retry.
      setImportSeed(openOn ?? null);
      setImportOpen(true);
      return;
    }
    if (importOutcome(result) === 'apply') {
      // The plan may have changed while the catalogs loaded: apply through the latest render.
      applyTextImportRef.current(result.entries);
      return;
    }
    setImportSeed(openOn ?? null);
    setImportPreview(result);
    setImportOpen(true);
  }

  // A skill plan pasted elsewhere (the seed): spent at once, so a re-render
  // can't import it twice.
  const seedRef = useRef<string | null>(null);
  useEffect(() => {
    if (importSeed === null || seedRef.current === importSeed) return;
    seedRef.current = importSeed;
    void importWithoutDialog(previewImportText(importSeed), importSeed);
  }, [importSeed]);

  /** A plan file dropped on the editor goes through the same import as the dialog's. */
  function handleEditorDrop(e: DragEvent<HTMLDivElement>) {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    void importWithoutDialog(previewImportFile(file));
  }

  /** Replace choice on the queue-import Modal (#1402): swaps entries, clears Remap Markers, leaves an Undo. */
  function confirmQueueImportReplace() {
    if (!pendingQueueImport) return;
    const { patch, undo } = replaceWithImport(editable, pendingQueueImport);
    setUndoImport(undo);
    onUpdate(patch);
    // Longer than Append/clipboard's 4s — this one carries an Undo action, so
    // it has to stay up long enough to use it.
    showImportConfirm(t('plans.importQueueReplaced'), 10000);
    setPendingQueueImport(null);
  }

  /** Undo beside the post-Replace confirmation: restores the snapshot taken just before it. */
  function undoQueueImportReplace() {
    if (!undoImport) return;
    cancelImportConfirm();
    onUpdate(undoImport);
    setUndoImport(null);
    setImportConfirm(null);
  }

  /** Closing the dialog drops the seed text and any preview it was opened on. */
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
    closeImportDialog,
    handleEditorDrop,
  };
}
