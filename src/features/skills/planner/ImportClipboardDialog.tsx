import { romanLevel } from '@/engine/projection';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, LiveStatus, Modal, TextArea, Tooltip } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import type { PlanXmlDocumentErrorCode } from './planXmlDocument';
import { importOutcome, type ClipboardImportPreview } from './clipboardImport';
import { previewImportFile, previewImportText } from './importPreview';

interface ImportClipboardDialogProps {
  onApply: (entries: PlanEntry[]) => void;
  onReplace?: (entries: PlanEntry[]) => void;
  onClose: () => void;
  nameFor: (skillTypeID: number) => string;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  initialText?: string;
  initialPreview?: ClipboardImportPreview;
}

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

export function ImportClipboardDialog({
  onApply,
  onReplace,
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
  const noEntries = preview !== null && preview.entries.length === 0;
  const noText = text.trim() === '';

  async function run(previewing: Promise<ClipboardImportPreview>, commit = onApply) {
    setImporting(true);
    try {
      const result = await previewing;
      if (importOutcome(result) === 'apply') commit(result.entries);
      else setPreview(result);
    } finally {
      setImporting(false);
    }
  }

  function handleImport(commit = onApply) {
    if (importing || text.trim() === '') return;
    void run(previewImportText(text), commit);
  }

  function handleFile(file: File) {
    if (importing) return;
    void run(previewImportFile(file));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('plans.importDialogTitle')}
      initialFocusRef={textRef}
      footer={
        <div className="flex items-center gap-2">
          <Button onClick={onClose}>{t('plans.importCancel')}</Button>
          {needsReview ? (
            <>
              {onReplace && (
                <Tooltip content={noEntries ? t('plans.importNothingToApply') : null}>
                  <Button
                    variant="danger"
                    onClick={() => onReplace(preview.entries)}
                    aria-disabled={noEntries || undefined}
                  >
                    {t('plans.importQueueReplace')}
                  </Button>
                </Tooltip>
              )}
              <Tooltip content={noEntries ? t('plans.importNothingToApply') : null}>
                <Button
                  variant="primary"
                  onClick={() => onApply(preview.entries)}
                  aria-disabled={noEntries || undefined}
                >
                  {onReplace ? t('plans.importAppendToPlan') : t('plans.importApply')}
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              {onReplace && (
                <Tooltip content={noText ? t('plans.importNeedsText') : null}>
                  <Button
                    variant="danger"
                    onClick={() => handleImport(onReplace)}
                    aria-disabled={noText || undefined}
                    loading={importing}
                  >
                    {t('plans.importQueueReplace')}
                  </Button>
                </Tooltip>
              )}
              <Tooltip content={noText ? t('plans.importNeedsText') : null}>
                <Button
                  variant="primary"
                  onClick={() => handleImport()}
                  aria-disabled={noText || undefined}
                  loading={importing}
                >
                  {onReplace ? t('plans.importAppendToPlan') : t('plans.importAction')}
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      }
    >
      <div
        className={`space-y-3 ${dragOver ? 'outline-1 outline-dashed outline-accent' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
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
                              <span className="ml-2 text-[0.6875rem] uppercase">
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
