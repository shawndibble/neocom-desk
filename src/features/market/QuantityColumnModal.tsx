/**
 * "Which column is the quantity?" — opens when a pasted details-view copy has
 * text where the count belongs. The pilot picks the column; nothing is chosen
 * for them, and leaving it keeps the report-only result (#6281).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Radio, Tooltip } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { AppraisalUnreadableLine } from '@/engine/market/appraisalPaste';

/** How many reported lines the preview shows. */
const PREVIEW_LINES = 3;

interface QuantityColumnModalProps {
  open: boolean;
  onClose: () => void;
  onChoose: (column: number) => void;
  /** The reported text-quantity lines; the preview shows the first few. */
  lines: readonly AppraisalUnreadableLine[];
  choices: readonly { column: number; sample: string }[];
}

export function QuantityColumnModal({
  open,
  onClose,
  onChoose,
  lines,
  choices,
}: QuantityColumnModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);
  const preview = lines.slice(0, PREVIEW_LINES).map((line) => line.name.split('\t'));
  const width = Math.max(0, ...preview.map((fields) => fields.length));

  function close() {
    setSelected(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('market.appraisal.quantityColumn.title')}
      placement="center"
      footer={
        <>
          <Button onClick={close}>{t('market.appraisal.quantityColumn.leave')}</Button>
          <Tooltip
            content={selected === null ? t('market.appraisal.quantityColumn.confirmEmpty') : null}
          >
            <Button
              variant="primary"
              aria-disabled={selected === null || undefined}
              onClick={() => {
                if (selected === null) return;
                const column = selected;
                setSelected(null);
                onChoose(column);
              }}
            >
              {t('market.appraisal.quantityColumn.confirm')}
            </Button>
          </Tooltip>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-dim">{t('market.appraisal.quantityColumn.intro')}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[0.6875rem]">
            <thead>
              <tr>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} className="px-2 py-1 text-left font-semibold text-text-dim">
                    {t('market.appraisal.quantityColumn.columnHeader', { n: i + 1 })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((fields, row) => (
                <tr key={row} className="border-t border-line">
                  {Array.from({ length: width }, (_, i) => (
                    <td key={i} className="px-2 py-1 text-text-dim">
                      {fields[i] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <fieldset className="flex flex-col">
          <legend className="pb-1 text-xs text-text-dim">
            {t('market.appraisal.quantityColumn.choices')}
          </legend>
          {choices.map(({ column, sample }) => (
            <label
              key={column}
              className={`flex items-center gap-2 text-sm ${tappableRowClassName}`}
            >
              <Radio
                name="appraisal-quantity-column"
                checked={selected === column}
                onChange={() => setSelected(column)}
              />
              {t('market.appraisal.quantityColumn.choice', { column, sample })}
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
}
