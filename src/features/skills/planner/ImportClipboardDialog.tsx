import { romanLevel } from '@/engine/projection';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, LiveStatus, Modal, TextArea } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import type { PlanXmlDocumentErrorCode } from './planXmlDocument';
import { importOutcome, type ClipboardImportPreview } from './clipboardImport';
import { previewImportFile, previewImportText } from './importPreview';

interface ImportClipboardDialogProps {
  onApply: (entries: PlanEntry[]) => void;
  onClose: () => void;
  /** Skill name for display — the EFT path's entries are raw skillTypeIDs the user has never seen. */
  nameFor: (skillTypeID: number) => string;
  /** To tag preview rows the character has already trained to (or past) the requested level (UX-REVIEW #7). */
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /** Text to open on — a skill plan pasted elsewhere in the app. */
  initialText?: string;
  /** What importing `initialText` (or a dropped file) found, when it needs a look before it is applied. */
  initialPreview?: ClipboardImportPreview;
}

/** True when the character is already trained to (or past) the entry's requested level. */
function isAlreadyTrained(
  entry: PlanEntry,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): boolean {
  return (trainedSkills.get(entry.skillTypeID)?.level ?? 0) >= entry.targetLevel;
}

const DOCUMENT_ERROR_KEYS: Record<PlanXmlDocumentErrorCode, string> = {
  tooLarge: 'plans.importFileTooLarge',
  readFailed: 'plans.importFileReadFailed',
  decompressFailed: 'plans.importFileDecompressFailed',
  unsupportedFormat: 'plans.importFileUnsupportedFormat',
  browserUnsupported: 'plans.importFileBrowserUnsupported',
  malformedXml: 'plans.importFileMalformedXml',
  multiPlanUnsupported: 'plans.importFileMultiPlanUnsupported',
};

/**
 * "Import plan": paste an EFT fit or skill-plan text, or choose/drop a plan
 * file (.emp/.xml) exported by another planner. Import applies at once when
 * every line parsed; when some did not, the preview (what was read, what was
 * skipped) comes up first and Apply commits it. Paste format (EFT vs. skill
 * plan) is auto-detected — see clipboardImport.ts.
 */
export function ImportClipboardDialog({
  onApply,
  onClose,
  nameFor,
  trainedSkills,
  initialText,
  initialPreview,
}: ImportClipboardDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText ?? '');
  const [preview, setPreview] = useState<ClipboardImportPreview | null>(initialPreview ?? null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const empty = preview !== null && importOutcome(preview) === 'empty';
  const needsReview = preview !== null && importOutcome(preview) === 'review';

  /** Preview, then apply straight away unless something needs a look. */
  async function run(previewing: Promise<ClipboardImportPreview>) {
    setImporting(true);
    try {
      const result = await previewing;
      if (importOutcome(result) === 'apply') onApply(result.entries);
      else setPreview(result);
    } finally {
      setImporting(false);
    }
  }

  function handleImport() {
    if (importing || text.trim() === '') return;
    void run(previewImportText(text));
  }

  function handleFile(file: File) {
    if (importing) return;
    void run(previewImportFile(file));
  }

  return (
    // `open` is literal: PlanEditor mounts this component only while the import
    // is open, so mounting is the open signal.
    <Modal
      open
      onClose={onClose}
      title={t('plans.importDialogTitle')}
      initialFocusRef={textRef}
      footer={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onClose}>
            {t('plans.importCancel')}
          </Button>
          {/* One primary: Import until something needs a look, then Apply commits what was read. */}
          {needsReview ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onApply(preview.entries)}
              disabled={preview.entries.length === 0}
            >
              {t('plans.importApply')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={handleImport}
              disabled={text.trim() === ''}
              loading={importing}
            >
              {t('plans.importAction')}
            </Button>
          )}
        </div>
      }
    >
      <div
        className={`space-y-3 ${dragOver ? 'outline-1 outline-dashed outline-accent' : ''}`}
        onDragOver={(e) => {
          // Only a file is ours to take; dragged text still drops into the textarea.
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          // Crossing onto a child fires a leave too; only leaving the body counts.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={(e) => {
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          e.preventDefault();
          handleFile(file);
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="clipboard-import-text">
          {t('plans.importPaste')}
        </label>
        <TextArea
          ref={textRef}
          id="clipboard-import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          onSubmitChord={() => {
            if (!needsReview) handleImport();
          }}
          rows={8}
          className="text-xs"
          aria-describedby={empty ? 'clipboard-import-empty' : undefined}
        />
        {empty && <FieldError id="clipboard-import-empty">{t('plans.importEmpty')}</FieldError>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".emp,.xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleFile(file);
          }}
        />
        <p className="text-xs text-text-dim">
          <button
            type="button"
            className={inlineLinkClassName}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('plans.importFileChoose')}
          </button>
        </p>

        <LiveStatus>
          {needsReview && !preview.documentErrorCode
            ? t('plans.importPreviewSummary', {
                ready: preview.entries.length,
                warnings: preview.warnings.length,
                errors: preview.errors.length,
              })
            : null}
        </LiveStatus>

        {needsReview && (
          <div className="space-y-2 border-t border-line pt-2 text-xs">
            {preview.documentErrorCode ? (
              <p role="alert" className="text-danger">
                {t(DOCUMENT_ERROR_KEYS[preview.documentErrorCode])}
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                    {t('plans.importPreview')}
                  </p>
                  {preview.entries.length === 0 ? (
                    <p className="text-text-dim">{t('plans.importEmpty')}</p>
                  ) : (
                    <ul className="mt-1 max-h-40 overflow-y-auto">
                      {preview.entries.map((entry) => {
                        const alreadyTrained = isAlreadyTrained(entry, trainedSkills);
                        return (
                          <li
                            key={entry.skillTypeID}
                            className={`border-b border-line py-0.5 last:border-b-0 ${
                              alreadyTrained ? 'text-text-dim italic' : ''
                            }`}
                          >
                            {nameFor(entry.skillTypeID)} {romanLevel(entry.targetLevel)}
                            {alreadyTrained && (
                              <span className="ml-2 text-[0.625rem] uppercase">
                                {t('plans.alreadyTrained')}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {preview.warnings.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest text-warning uppercase">
                      {t('plans.importWarnings')}
                    </p>
                    <ul className="mt-1">
                      {preview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.errors.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest text-danger uppercase">
                      {t('plans.importErrors')}
                    </p>
                    <ul className="mt-1">
                      {preview.errors.map((err) => (
                        <li key={`${err.line}-${err.text}`}>
                          {t('plans.importLine', {
                            line: err.line,
                            text: err.text,
                            reason: err.reason,
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
