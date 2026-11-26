import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, IskInput, textActionClassName } from '@/components/ui';
import type { MiningTaxPaymentMethod } from '@/db';
import { balanceAfter, payoutReason } from '@/engine/corpTaxBook/payouts';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { useCopiedField } from '@/features/miningTax/settleUpFields';
import { SettleCopyRow, SettleSentOnAndMethod } from '@/features/miningTax/SettleUpParts';
import { DialogShell, Effect } from './BookDialogs';
import { isk } from './moonsFormat';
import { utcDay } from '@/engine/localDay';
import { DividedList } from '@/components/ui/DividedList';

const k = (key: string) => `corpTaxBook.moons.moonOwners.pay.${key}`;

export function PayMoonOwnerDialog({
  ownerName,
  payee,
  balance,
  period,
  manual = false,
  onClose,
  onRecord,
}: {
  ownerName: string;
  payee: { id: number; name: string };
  balance: number;
  period: { from: string; to: string } | undefined;
  manual?: boolean;
  onClose: () => void;
  onRecord: (payout: {
    amount: number;
    date: string;
    method: MiningTaxPaymentMethod;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { copied, copy } = useCopiedField();
  const whole = Math.max(0, Math.floor(balance));
  const [paidOn, setPaidOn] = useState(() => utcDay());
  const [method, setMethod] = useState<MiningTaxPaymentMethod>('donation');
  const [different, setDifferent] = useState(manual);
  const [sentText, setSentText] = useState('');
  const typed = different ? unmaskNumber(sentText) : undefined;
  const amount = different ? Math.round(typed ?? 0) : whole;
  const reason = payoutReason(t(k('reasonPrefix')), period);
  const shown = (b: ReturnType<typeof balanceAfter>) =>
    b.kind === 'credit' ? t(k('afterCredit'), { amount: isk(b.isk) }) : isk(b.isk);
  const beforeText = shown(balanceAfter(balance, 0));
  const afterText = shown(balanceAfter(balance, amount));

  return (
    <DialogShell
      open
      onClose={onClose}
      title={t(manual ? k('addTitle') : k('title'), { name: ownerName })}
      confirmLabel={t(k('confirm'))}
      canConfirm={amount > 0 && paidOn !== ''}
      run={() => onRecord({ amount, date: paidOn, method })}
    >
      <p className="text-sm">{t(k('intro'))}</p>
      <DividedList>
        <SettleCopyRow
          label={t('miningTax.settleUp.toLabel')}
          value={payee.name}
          copied={copied === 'to'}
          onCopy={() => void copy('to', payee.name)}
          openInEve={{ name: payee.name, entityId: payee.id }}
        />
        <SettleCopyRow
          label={t('miningTax.settleUp.amountLabel')}
          value={`${formatIsk(amount, 0)} ISK`}
          copied={copied === 'amount'}
          onCopy={() => void copy('amount', String(amount))}
        />
        <SettleCopyRow
          label={t('miningTax.settleUp.reasonLabel')}
          value={reason}
          copied={copied === 'reason'}
          onCopy={() => void copy('reason', reason)}
          dim
        />
      </DividedList>
      {!manual && (
        <div className="space-y-1.5">
          <button
            type="button"
            className={textActionClassName('gap-1.5')}
            aria-expanded={different}
            onClick={() => {
              setDifferent((v) => !v);
              setSentText('');
            }}
          >
            <Caret expanded={different} />
            {different
              ? t('miningTax.settleUp.differentAmountHide')
              : t('miningTax.settleUp.differentAmountAction')}
          </button>
        </div>
      )}
      {different && (
        <IskInput
          value={sentText}
          onChange={setSentText}
          placeholder={t('miningTax.settleUp.sentAmountPlaceholder')}
          aria-label={t('miningTax.settleUp.sentAmountLabel')}
        />
      )}
      <SettleSentOnAndMethod
        paidOn={paidOn}
        onPaidOn={setPaidOn}
        method={method}
        onMethod={setMethod}
      />
      <Effect>{t(k('change'), { before: beforeText, after: afterText })}</Effect>
    </DialogShell>
  );
}
