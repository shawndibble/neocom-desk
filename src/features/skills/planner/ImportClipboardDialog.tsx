import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Tabs, type TabItem } from '@/components/ui';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import { readFromClipboard } from '@/lib/clipboard';
import type { PlanXmlDocumentErrorCode } from './planXmlDocument';
import { loadUniverseType } from '../data';
import { loadItemNameMap, loadSkillNameMap } from '../typeCatalog';
import { previewClipboardImport, type ClipboardImportPreview } from './clipboardImport';
import { previewPlanXmlImport } from './planXmlImport';

interface ImportClipboardDialogProps {
  onApply: (entries: PlanEntry[]) => void;
  onClose: () => void;
  /** Skill name for display — the EFT path's entries are raw skillTypeIDs the user has never seen. */
  nameFor: (skillTypeID: number) => string;
  /** To tag preview rows the character has already trained to (or past) the requested level (UX-REVIEW #7). */
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
}

/** True when the character is already trained to (or past) the entry's requested level. */
function isAlreadyTrained(
  entry: PlanEntry,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): boolean {
  return (trainedSkills.get(entry.skillTypeID)?.level ?? 0) >= entry.targetLevel;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

const DOCUMENT_ERROR_KEYS: Record<PlanXmlDocumentErrorCode, string> = {
  tooLarge: 'plans.importFileTooLarge',
  readFailed: 'plans.importFileReadFailed',
  decompressFailed: 'plans.importFileDecompressFailed',
  unsupportedFormat: 'plans.importFileUnsupportedFormat',
  browserUnsupported: 'plans.importFileBrowserUnsupported',
  malformedXml: 'plans.importFileMalformedXml',
  multiPlanUnsupported: 'plans.importFileMultiPlanUnsupported',
};

const IMPORT_MODE_KEYS = {
  eftFit: 'plans.importModeEft',
  skillPlan: 'plans.importModeSkillPlan',
  planXml: 'plans.importModePlanXml',
} as const;

/**
 * "Import from clipboard": paste an EFT fit or skill-plan text, or pick/drop
 * a plan file (.emp/.xml) exported by another planner — preview the parsed
 * entries (plus warnings/errors) before committing anything. Paste-mode
 * format (EFT vs. skill plan) is auto-detected — see clipboardImport.ts.
 */
export function ImportClipboardDialog({
  onApply,
  onClose,
  nameFor,
  trainedSkills,
}: ImportClipboardDialogProps) {
  const { t } = useTranslation();
  const tabs: TabItem[] = [
    { id: 'paste', label: t('plans.importPasteTab') },
    { id: 'file', label: t('plans.importFileTab') },
  ];
  const [tab, setTab] = useState<'paste' | 'file'>('paste');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ClipboardImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteError, setPasteError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * The Clipboard API's `readText` needs an explicit user gesture and
   * permission the browser may deny — unlike the textarea's own native
   * Ctrl+V, which always works. A failure here falls back to that existing
   * path rather than blocking the import, so it degrades to "manually paste
   * into the textarea", not "can't import."
   */
  async function handlePasteFromClipboard() {
    setPasteError(false);
    try {
      const clipboardText = await readFromClipboard();
      setText(clipboardText);
      setPreview(null);
    } catch {
      setPasteError(true);
    }
  }

  async function handleParse() {
    setParsing(true);
    try {
      const [skillByName, typeByName] = await Promise.all([loadSkillNameMap(), loadItemNameMap()]);
      const result = await previewClipboardImport(text, {
        skillByName,
        typeByName,
        loadType: loadUniverseType,
      });
      setPreview(result);
    } finally {
      setParsing(false);
    }
  }

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const skillByName = await loadSkillNameMap();
      const result = await previewPlanXmlImport(file, skillByName);
      setPreview(result);
    } catch {
      // previewPlanXmlImport/parsePlanXmlFile are designed never to throw,
      // but a failure here (e.g. the catalog load itself) must still surface
      // as an inline error rather than an unhandled rejection — this call
      // site is always invoked as a floating promise (file input/drop
      // handlers can't await).
      setPreview({
        mode: 'planXml',
        entries: [],
        warnings: [],
        errors: [],
        documentErrorCode: 'readFailed',
      });
    } finally {
      setParsing(false);
    }
  }

  return (
    // `open` is literal: PlanEditor mounts this component only while the import
    // is open, so mounting is the open signal.
    <Modal open onClose={onClose} title={t('plans.importDialogTitle')}>
      <div className="space-y-3">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(id) => {
            setTab(id as 'paste' | 'file');
            setPreview(null);
          }}
          label={t('plans.importDialogTitle')}
        />

        {tab === 'paste' && (
          <>
            <label className="block text-xs text-text-dim" htmlFor="clipboard-import-text">
              {t('plans.importPaste')}
            </label>
            <textarea
              id="clipboard-import-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
              }}
              rows={8}
              className="w-full rounded-xs border border-line bg-panel-2 p-2 text-xs text-text"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => void handlePasteFromClipboard()}>
                {t('plans.pasteFromClipboard')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleParse()}
                disabled={parsing || text.trim() === ''}
              >
                {t('plans.importParse')}
              </Button>
            </div>
            {pasteError && (
              <p role="alert" className="text-xs text-danger">
                {t('plans.pasteFromClipboardFailed')}
              </p>
            )}
          </>
        )}

        {tab === 'file' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".emp,.xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleFile(file);
              }}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={`rounded-xs border border-dashed bg-panel-2 p-4 text-center text-xs text-text-dim ${
                dragOver ? 'border-accent' : 'border-line'
              }`}
            >
              <p>{t('plans.importFileDrop')}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                {t('plans.importFileBrowse')}
              </Button>
            </div>
          </>
        )}

        <Button size="sm" onClick={onClose}>
          {t('plans.importCancel')}
        </Button>

        {preview && (
          <div className="space-y-2 border-t border-line pt-2 text-xs">
            <p className="font-semibold text-text-dim uppercase">
              {t(IMPORT_MODE_KEYS[preview.mode])}
              {preview.planName ? ` — ${preview.planName}` : ''}
            </p>

            {preview.documentErrorCode ? (
              <p className="text-danger">{t(DOCUMENT_ERROR_KEYS[preview.documentErrorCode])}</p>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-text-dim uppercase">
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
                              alreadyTrained ? 'text-text-faint italic' : ''
                            }`}
                          >
                            {nameFor(entry.skillTypeID)} {ROMAN[entry.targetLevel - 1]}
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
                    <p className="font-semibold text-warning uppercase">
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
                    <p className="font-semibold text-danger uppercase">{t('plans.importErrors')}</p>
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

                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onApply(preview.entries)}
                  disabled={preview.entries.length === 0}
                >
                  {t('plans.importApply')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
