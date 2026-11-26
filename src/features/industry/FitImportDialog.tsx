import { tappableRowClassName } from '@/components/ui/controlStyles';
import { InlineError } from '@/components/ui/InlineError';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, Modal, Checkbox, TextArea, Tooltip } from '@/components/ui';
import { readFromClipboard } from '@/lib/clipboard';
import type { FitToBuildPlansResult } from '@/engine/import/fitToBuildPlans';
import type { BlueprintCatalog } from './blueprintCatalog';
import { previewFitImport } from './fitImport';

interface FitImportDialogProps {
  catalog: BlueprintCatalog;
  onApply: (preview: FitToBuildPlansResult) => void;
  onClose: () => void;
  initialText?: string;
}

export function FitImportDialog({ catalog, onApply, onClose, initialText }: FitImportDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => initialText ?? '');
  const [includeCharges, setIncludeCharges] = useState(false);
  const [preview, setPreview] = useState<FitToBuildPlansResult | null>(() =>
    initialText ? previewFitImport(initialText, catalog, { includeCharges: false }) : null
  );
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

  function toggleCharges(next: boolean) {
    setIncludeCharges(next);
    if (preview) parse(next);
  }

  const planCount = preview ? preview.items.length + (preview.hull ? 1 : 0) : 0;

  return (
    <Modal open onClose={onClose} title={t('industry.fitImportTitle')}>
      <div className="space-y-3">
        <label className="block text-xs text-text-dim" htmlFor="fit-import-text">
          {t('industry.fitImportPaste')}
        </label>
        <TextArea
          id="fit-import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          onSubmitChord={() => {
            if (text.trim() !== '') parse();
          }}
          rows={10}
          mono
          className="text-xs"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void handlePasteFromClipboard()}>
            {t('industry.fitImportPasteFromClipboard')}
          </Button>
          <LiveStatus>
            {preview
              ? planCount === 0
                ? t('industry.fitImportEmpty')
                : t('industry.fitImportApply', { count: planCount })
              : null}
          </LiveStatus>
          <Tooltip content={text.trim() === '' ? t('industry.fitImportParseNeedsText') : null}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => parse()}
              aria-disabled={text.trim() === '' || undefined}
            >
              {t('industry.fitImportParse')}
            </Button>
          </Tooltip>
        </div>
        {pasteError && <InlineError>{t('industry.fitImportPasteFailed')}</InlineError>}

        {preview && (
          <div className="space-y-3 border-t border-line pt-3 text-xs">
            {preview.headerFailed && (
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

            <label className={`flex items-center gap-2 text-text-dim ${tappableRowClassName}`}>
              <Checkbox
                checked={includeCharges}
                onChange={(e) => toggleCharges(e.target.checked)}
              />
              {t('industry.fitImportIncludeCharges')}
            </label>

            <Tooltip content={planCount === 0 ? t('industry.fitImportApplyNothing') : null}>
              <Button
                size="sm"
                variant="primary"
                onClick={() => onApply(preview)}
                aria-disabled={planCount === 0 || undefined}
              >
                {t('industry.fitImportApply', { count: planCount })}
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </Modal>
  );
}
