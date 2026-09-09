/**
 * Paste an EFT fit, see exactly what it will create, then create it
 * (issue #626, "Fit Import" in CONTEXT.md).
 *
 * Modelled on the Skill Planner's `ImportClipboardDialog`: textarea → Parse →
 * a preview split into what will be built, what will not, and what could not
 * be read → Apply. Preview-then-apply rather than import-then-tell, because a
 * routine fit has a fifth of its lines unbuildable and the pilot needs to see
 * that before twelve plans appear in their list.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { readFromClipboard } from '@/lib/clipboard';
import type { FitToBuildPlansResult } from '@/engine/import/fitToBuildPlans';
import type { BlueprintCatalog } from './blueprintCatalog';
import { previewFitImport } from './fitImport';

interface FitImportDialogProps {
  catalog: BlueprintCatalog;
  /** Creates the group and its plans. Receives the preview the pilot approved. */
  onApply: (preview: FitToBuildPlansResult) => void;
  onClose: () => void;
}

export function FitImportDialog({ catalog, onApply, onClose }: FitImportDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [includeCharges, setIncludeCharges] = useState(false);
  const [preview, setPreview] = useState<FitToBuildPlansResult | null>(null);
  const [pasteError, setPasteError] = useState(false);

  async function handlePasteFromClipboard() {
    setPasteError(false);
    try {
      setText(await readFromClipboard());
      setPreview(null);
    } catch {
      setPasteError(true);
    }
  }

  function parse(nextIncludeCharges = includeCharges) {
    setPreview(previewFitImport(text, catalog, { includeCharges: nextIncludeCharges }));
  }

  // Toggling charges re-parses in place rather than clearing the preview: the
  // checkbox exists to answer "what changes if I include them", and making the
  // pilot press Parse again to find out hides the answer behind a second step.
  function toggleCharges(next: boolean) {
    setIncludeCharges(next);
    if (preview) parse(next);
  }

  const planCount = preview ? preview.items.length + (preview.hull ? 1 : 0) : 0;

  return (
    // `open` is literal: the list mounts this component only while the import
    // is open, so mounting is the open signal.
    <Modal open onClose={onClose} title={t('industry.fitImportTitle')}>
      <div className="space-y-3">
        <label className="block text-xs text-text-dim" htmlFor="fit-import-text">
          {t('industry.fitImportPaste')}
        </label>
        <textarea
          id="fit-import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          rows={10}
          className="w-full rounded-xs border border-line bg-panel-2 p-2 font-mono text-xs text-text"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void handlePasteFromClipboard()}>
            {t('industry.fitImportPasteFromClipboard')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => parse()} disabled={text.trim() === ''}>
            {t('industry.fitImportParse')}
          </Button>
        </div>
        {pasteError && (
          <p role="alert" className="text-xs text-danger">
            {t('industry.fitImportPasteFailed')}
          </p>
        )}

        {preview && (
          <div className="space-y-3 border-t border-line pt-3 text-xs">
            {preview.groupName === null && (
              <p role="alert" className="text-danger">
                {t('industry.fitImportHeaderFailed')}
              </p>
            )}

            <div>
              <p className="font-semibold tracking-widest text-text-dim uppercase">
                {t('industry.fitImportWillCreate')}
              </p>
              {planCount === 0 ? (
                <p className="mt-1 text-text-dim">{t('industry.fitImportEmpty')}</p>
              ) : (
                <ul className="mt-1 max-h-48 overflow-y-auto">
                  {[...(preview.hull ? [preview.hull] : []), ...preview.items].map((row) => (
                    <li key={row.blueprintTypeID} className="flex justify-between gap-2 py-0.5">
                      <span className="truncate">
                        {t('industry.fitImportRow', {
                          name: row.productName,
                          quantity: row.quantity,
                        })}
                      </span>
                      <span className="shrink-0 tabular-nums text-text-dim">
                        {t('industry.fitImportRuns', { count: row.runs })}
                        {/* Only when the blueprint's batch size forces
                            overproduction — silence means it came out even. */}
                        {row.spare > 0
                          ? ` · ${t('industry.fitImportSpare', { count: row.spare })}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {preview.skipped.length > 0 && (
              <div>
                <p className="font-semibold tracking-widest text-warning uppercase">
                  {t('industry.fitImportSkipped')}
                </p>
                <ul className="mt-1 max-h-32 overflow-y-auto">
                  {preview.skipped.map((item) => (
                    <li key={item.name} className="py-0.5">
                      {t('industry.fitImportRow', { name: item.name, quantity: item.quantity })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.excludedCharges.length > 0 && (
              <div>
                <p className="font-semibold tracking-widest text-warning uppercase">
                  {t('industry.fitImportCharges')}
                </p>
                <ul className="mt-1">
                  {preview.excludedCharges.map((item) => (
                    <li key={item.name} className="py-0.5">
                      {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="flex items-center gap-2 text-text-dim">
              <input
                type="checkbox"
                checked={includeCharges}
                onChange={(e) => toggleCharges(e.target.checked)}
                className="size-4 shrink-0 cursor-pointer accent-accent"
              />
              {t('industry.fitImportIncludeCharges')}
            </label>

            <Button
              size="sm"
              variant="primary"
              onClick={() => onApply(preview)}
              disabled={planCount === 0}
            >
              {t('industry.fitImportApply', { count: planCount })}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
