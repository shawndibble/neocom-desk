import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, Modal, TextInput } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { SourcingInput } from './SourcingInput';
import type { RunLoss } from './useRunLoss';
import { DialogFooter } from '@/components/ui/DialogFooter';

function todayInput(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function RunLossModals({ loss }: { loss: RunLoss }) {
  const { t } = useTranslation();
  const quantityErrorId = useId();
  const dialog = loss.dialog;
  const writtenOffCost = loss.writtenOffCost;

  return (
    <>
      <Modal
        open={dialog !== null}
        onClose={loss.closeLoss}
        title={dialog?.lossId ? t('industry.editLoss') : t('industry.markAsLost')}
      >
        {dialog && writtenOffCost !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                {t('industry.lossUnits')}
                <SourcingInput
                  value={unmaskNumber(dialog.form.quantity)}
                  label={t('industry.lossUnits')}
                  inputMode="numeric"
                  widthClassName="w-full"
                  invalid={dialog.error !== null}
                  describedBy={dialog.error ? quantityErrorId : undefined}
                  parse={(raw) => unmaskNumber(raw)}
                  onCommit={(value) =>
                    loss.setLossForm((f) => ({
                      ...f,
                      quantity: value === undefined ? '' : String(value),
                    }))
                  }
                />
                <span className="text-[0.6875rem] text-text-dim">
                  {t('industry.lossUnitsHint', { count: dialog.unaccounted })}
                </span>
                {dialog.error && (
                  <FieldError id={quantityErrorId}>
                    {dialog.error === 'too-many'
                      ? t('industry.lossUnitsTooMany', { count: dialog.unaccounted })
                      : t('industry.lossUnitsInvalid')}
                  </FieldError>
                )}
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {t('industry.lossDate')}
                <TextInput
                  size="sm"
                  type="date"
                  value={dialog.form.date}
                  max={todayInput()}
                  onChange={(e) => loss.setLossForm((f) => ({ ...f, date: e.target.value }))}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              {t('industry.lossNote')}
              <TextInput
                size="sm"
                type="text"
                maxLength={120}
                value={dialog.form.note}
                onChange={(e) => loss.setLossForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>

            <dl className="space-y-1 rounded-xs border border-line px-2.5 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-text-dim">{t('industry.lossCostWrittenOff')}</dt>
                <dd>{formatIsk(writtenOffCost)}</dd>
              </div>
            </dl>

            <DialogFooter>
              <Button size="sm" onClick={loss.closeLoss}>
                {t('industry.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void loss.saveLoss()}>
                {dialog.lossId ? t('industry.saveLoss') : t('industry.markAsLost')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Modal>

      <Modal
        open={loss.removingLossId !== null}
        onClose={loss.cancelRemoveLoss}
        title={t('industry.removeLoss')}
      >
        <p className="text-xs text-text-dim">{t('industry.removeLossConfirm')}</p>
        <DialogFooter className="mt-3">
          <Button size="sm" onClick={loss.cancelRemoveLoss}>
            {t('industry.keepLoss')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void loss.removeLoss()}>
            {t('industry.removeLoss')}
          </Button>
        </DialogFooter>
      </Modal>
    </>
  );
}
