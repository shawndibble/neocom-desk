import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import { loadUniverseType } from '../data';
import { loadItemNameMap, loadSkillNameMap } from '../typeCatalog';
import { previewClipboardImport, type ClipboardImportPreview } from './clipboardImport';

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

/**
 * "Import from clipboard": paste an EFT fit or skill-plan text, preview the
 * parsed entries (plus warnings/errors) before committing anything. Mode
 * (EFT vs. skill plan) is auto-detected — see clipboardImport.ts.
 */
export function ImportClipboardDialog({
  onApply,
  onClose,
  nameFor,
  trainedSkills,
}: ImportClipboardDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ClipboardImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('plans.importDialogTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto">
        <Panel title={t('plans.importDialogTitle')}>
          <div className="space-y-3">
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

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleParse()}
                disabled={parsing || text.trim() === ''}
              >
                {t('plans.importParse')}
              </Button>
              <Button size="sm" onClick={onClose}>
                {t('plans.importCancel')}
              </Button>
            </div>

            {preview && (
              <div className="space-y-2 border-t border-line pt-2 text-xs">
                <p className="font-semibold text-text-dim uppercase">
                  {preview.mode === 'eftFit'
                    ? t('plans.importModeEft')
                    : t('plans.importModeSkillPlan')}
                </p>

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
                              <span className="ml-2 text-[10px] uppercase">
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
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
