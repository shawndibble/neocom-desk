import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  FieldError,
  Modal,
  Radio,
  SegmentedControl,
  TextInput,
} from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { SourcingInput } from './MaterialsTable';
import type { LossInsuranceMode, RunLoss } from './useRunLoss';

function todayInput(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * The two dialogs `useRunLoss`'s state drives (issue #2851): the Mark as
 * lost / Edit loss form with its live net-loss preview, and the one-step
 * remove confirmation. Mount once alongside the table, like `SaleLinkingModals`.
 */
export function RunLossModals({ loss }: { loss: RunLoss }) {
  const { t } = useTranslation();
  const quantityErrorId = useId();
  const dialog = loss.dialog;
  const preview = loss.preview;

  const modes: { value: LossInsuranceMode; label: string; disabled?: boolean }[] = [
    {
      value: 'wallet',
      label: t('industry.lossInsuranceWallet'),
      disabled: !dialog?.walletAvailable,
    },
    { value: 'isk', label: t('industry.lossInsuranceIsk') },
    { value: 'none', label: t('industry.lossInsuranceNone') },
  ];

  return (
    <>
      <Modal
        open={dialog !== null}
        onClose={loss.closeLoss}
        title={dialog?.lossId ? t('industry.editLoss') : t('industry.markAsLost')}
      >
        {dialog && preview && (
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

            <div className="space-y-2">
              <SegmentedControl
                label={t('industry.lossInsurance')}
                options={modes}
                value={dialog.form.insuranceMode}
                onChange={(insuranceMode) => loss.setLossForm((f) => ({ ...f, insuranceMode }))}
                fill
              />
              {dialog.form.insuranceMode === 'wallet' &&
                (dialog.journal.length === 0 ? (
                  <EmptyState title={t('industry.lossNoPayouts')} className="py-3" />
                ) : (
                  <ul
                    className="space-y-1"
                    role="radiogroup"
                    aria-label={t('industry.lossInsurance')}
                  >
                    {dialog.journal.map((entry) => (
                      <li key={entry.id}>
                        <label className="flex items-center gap-2 rounded-xs border border-line px-2.5 py-1.5 text-[0.6875rem]">
                          <Radio
                            name="loss-payout"
                            checked={dialog.form.journalEntryId === entry.id}
                            onChange={() =>
                              loss.setLossForm((f) => ({ ...f, journalEntryId: entry.id }))
                            }
                          />
                          <span>
                            {formatIsk(entry.amount ?? 0)}
                            {' — '}
                            {new Date(entry.date).toLocaleDateString()}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ))}
              {dialog.form.insuranceMode === 'isk' && (
                <label className="flex flex-col gap-1 text-xs">
                  {t('industry.lossInsuranceAmount')}
                  <SourcingInput
                    value={unmaskNumber(dialog.form.isk)}
                    label={t('industry.lossInsuranceAmount')}
                    inputMode="numeric"
                    widthClassName="w-full"
                    parse={(raw) => unmaskNumber(raw)}
                    onCommit={(value) =>
                      loss.setLossForm((f) => ({
                        ...f,
                        isk: value === undefined ? '' : String(value),
                      }))
                    }
                  />
                </label>
              )}
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
                <dd>{formatIsk(preview.writtenOffCost)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-dim">{t('industry.lossInsurancePayout')}</dt>
                <dd>{formatIsk(preview.insurance)}</dd>
              </div>
              <div className="flex justify-between gap-2 font-semibold">
                <dt>{t('industry.lossNet')}</dt>
                <dd>{formatIsk(-preview.netLoss)}</dd>
              </div>
            </dl>

            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={loss.closeLoss}>
                {t('industry.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void loss.saveLoss()}>
                {dialog.lossId ? t('industry.saveLoss') : t('industry.markAsLost')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={loss.removingLossId !== null}
        onClose={loss.cancelRemoveLoss}
        title={t('industry.removeLoss')}
      >
        <p className="text-xs text-text-dim">{t('industry.removeLossConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={loss.cancelRemoveLoss}>
            {t('industry.keepLoss')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void loss.removeLoss()}>
            {t('industry.removeLoss')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
