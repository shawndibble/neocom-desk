import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, InfoTooltip, Tooltip, TextInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { MiningTaxPaymentMethod } from '@/db';
import { SETTLE_FIELD_LABEL, SETTLE_METHODS } from './settleUpFields';
import { cx } from '@/lib/cx';
import { PayeeOpenInEveButton } from './PayeeOpenInEveButton';

const SETTLE_ROW_LABEL = cx(SETTLE_FIELD_LABEL, 'w-18 shrink-0');

export function SettleCopyRow({
  label,
  value,
  copied,
  onCopy,
  dim = false,
  openInEve,
  hint,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  dim?: boolean;
  openInEve?: { name: string; entityId?: number; payeeId?: string };
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
      <span className={SETTLE_ROW_LABEL}>{label}</span>
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
      {hint && (
        <InfoTooltip label={t('miningTax.settleUp.aboutNamed', { what: label })} content={hint} />
      )}
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

export function SettleInfoRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
      <span className={SETTLE_ROW_LABEL}>{label}</span>
      <span
        className={cx(
          'flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xs break-words',
          tappableRowClassName
        )}
      >
        <span className="font-semibold">{value}</span>
        {note && <span className="text-text-dim">{note}</span>}
      </span>
    </div>
  );
}

export function SettleSentOnAndMethod({
  paidOn,
  onPaidOn,
  method,
  onMethod,
  extra,
  methods = SETTLE_METHODS,
}: {
  paidOn: string;
  onPaidOn: (value: string) => void;
  method: MiningTaxPaymentMethod;
  onMethod: (value: MiningTaxPaymentMethod) => void;
  extra?: ReactNode;
  methods?: readonly MiningTaxPaymentMethod[];
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
      {methods.length > 1 && (
        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className={SETTLE_FIELD_LABEL}>{t('miningTax.settleUpMethodLabel')}</p>
          <div className="flex gap-1.5">
            {methods.map((m) => (
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
      )}
      {extra}
    </div>
  );
}
