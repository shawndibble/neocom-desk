import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Tooltip, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MiningTaxPaymentMethod } from '@/db';
import { SETTLE_FIELD_LABEL, SETTLE_METHODS } from './settleUpFields';
import { cx } from '@/lib/cx';
import { PayeeOpenInEveButton } from './PayeeOpenInEveButton';

/**
 * The parts of Settle up that do not depend on what is being settled: the
 * copyable To / Amount / Reason rows, and the sent-on date with the method.
 * `SettleUpDialog` (Mining Tax entries) and the moon owner payout dialog both
 * compose these, so the shell reads and behaves the same in both.
 */

/** One labelled line the app cannot send for the pilot: shown, with Copy (and Open in EVE for a payee). */
export function SettleCopyRow({
  label,
  value,
  copied,
  onCopy,
  dim = false,
  openInEve,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  dim?: boolean;
  openInEve?: { name: string; entityId?: number; payeeId?: string };
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
      <span className={cx(SETTLE_FIELD_LABEL, 'w-14 shrink-0')}>{label}</span>
      <Tooltip content={value}>
        <span
          className={cx(
            'min-w-0 flex-1 text-xs break-words tabular-nums',
            dim ? 'text-text-dim' : 'font-semibold'
          )}
        >
          {value}
        </span>
      </Tooltip>
      {openInEve && <PayeeOpenInEveButton {...openInEve} />}
      <Button
        size="sm"
        className="shrink-0"
        onClick={onCopy}
        aria-label={t('miningTax.settleUp.copyNamed', { what: label })}
      >
        {copied ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
        )}
        {copied ? t('miningTax.settleUpCopied') : t('miningTax.settleUpCopy')}
      </Button>
    </div>
  );
}

/** The date the pilot paid and how; `extra` adds a field after them (a contract id). */
export function SettleSentOnAndMethod({
  paidOn,
  onPaidOn,
  method,
  onMethod,
  extra,
}: {
  paidOn: string;
  onPaidOn: (value: string) => void;
  method: MiningTaxPaymentMethod;
  onMethod: (value: MiningTaxPaymentMethod) => void;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="space-y-1 sm:w-36 sm:shrink-0">
        <p className={SETTLE_FIELD_LABEL}>{t('miningTax.settleUpPaidOnLabel')}</p>
        <TextInput
          type="date"
          size="sm"
          value={paidOn}
          onChange={(e) => onPaidOn(e.target.value)}
          aria-label={t('miningTax.settleUpPaidOnLabel')}
          className="w-full"
        />
      </div>
      <div className="min-w-0 space-y-1 sm:flex-1">
        <p className={SETTLE_FIELD_LABEL}>{t('miningTax.settleUpMethodLabel')}</p>
        <div className="flex gap-1.5">
          {SETTLE_METHODS.map((m) => (
            <FilterChip
              key={m}
              label={t(`miningTax.settleUpMethod.${m}`)}
              selected={method === m}
              onToggle={() => onMethod(m)}
              className="flex-1 justify-center"
            />
          ))}
        </div>
      </div>
      {extra}
    </div>
  );
}
