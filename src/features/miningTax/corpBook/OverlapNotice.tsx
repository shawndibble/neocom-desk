import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { TakeoverConfirm, type OverlapPreview } from './TakeoverConfirm';

export type { OverlapPreview } from './TakeoverConfirm';

interface Props {
  corpName: string;
  payeeNames: readonly string[];
  /** Every allocation involved is paid on its Payee's account: only "I paid it another way" is offered. */
  paid: boolean;
  previews: readonly OverlapPreview[];
  typeNames: ReadonlyMap<number, string>;
  busy?: boolean;
  error?: string | null;
  onTakeOver: () => void;
  onPaidAnotherWay: () => void;
  /**
   * Asked for on a Late notice (#6206): "I paid this another way" goes to the corporation, so this
   * replaces the device-only button.
   */
  paidAnotherWay?: ReactNode;
}

/**
 * The one notice on a day line when the miner's own list and the corporation's bill
 * cover the same ore (issue #4517). "Let the corporation bill it" first shows what
 * changes on the miner's list, then removes only the overlapping ore; "I paid it
 * another way" says the miner settled it elsewhere. Nothing is mailed or pushed.
 */
export function OverlapNotice({
  corpName,
  payeeNames,
  paid,
  previews,
  typeNames,
  busy,
  error,
  onTakeOver,
  onPaidAnotherWay,
  paidAnotherWay,
}: Props) {
  const { t } = useTranslation();
  const payee = payeeNames.join(', ');
  const other = paidAnotherWay ?? (
    <Button
      size="sm"
      variant="warning"
      aria-disabled={busy || undefined}
      onClick={onPaidAnotherWay}
    >
      {t('miningTax.corpBook.overlap.paidOther')}
    </Button>
  );

  return (
    <div
      role="region"
      aria-label={t('miningTax.corpBook.overlap.region')}
      className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
    >
      <p>
        {paid ? (
          t('miningTax.corpBook.overlap.noticePaid', { payee, corp: corpName })
        ) : (
          <Trans
            i18nKey="miningTax.corpBook.overlap.notice"
            values={{ payee, corp: corpName }}
            components={{ strong: <strong /> }}
          />
        )}
      </p>
      {paid ? (
        <div className="flex flex-wrap gap-2">{other}</div>
      ) : (
        <TakeoverConfirm
          previews={previews}
          typeNames={typeNames}
          busy={busy}
          onTakeOver={onTakeOver}
          others={other}
        />
      )}
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}
