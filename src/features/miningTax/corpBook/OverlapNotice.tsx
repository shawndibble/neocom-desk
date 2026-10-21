import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { OreLine } from '@/engine/miningTax/types';
import { typeLabel } from './typeLabel';
import { formatCount } from '@/lib/formatCount';

export interface OverlapPreview {
  payeeName: string;
  before: readonly OreLine[];
  after: readonly OreLine[];
}

interface Props {
  corpName: string;
  payeeNames: readonly string[];
  /** Every allocation involved is marked paid: only "I paid it another way" is offered. */
  paid: boolean;
  previews: readonly OverlapPreview[];
  typeNames: ReadonlyMap<number, string>;
  busy?: boolean;
  error?: string | null;
  onTakeOver: () => void;
  onPaidAnotherWay: () => void;
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
}: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const payee = payeeNames.join(', ');
  const describe = (lines: readonly OreLine[]) =>
    lines.length === 0
      ? t('miningTax.corpBook.overlap.nothingLeft')
      : lines.map((l) => `${formatCount(l.quantity)} ${typeLabel(typeNames, l.typeId)}`).join(', ');

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
      {confirming && (
        <div className="space-y-1">
          <p className="text-text-dim">{t('miningTax.corpBook.overlap.previewTitle')}</p>
          <ul className="space-y-0.5">
            {previews.map((p) => (
              <li key={p.payeeName}>
                {t('miningTax.corpBook.overlap.previewLine', {
                  payee: p.payeeName,
                  before: describe(p.before),
                  after: describe(p.after),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!paid &&
          (confirming ? (
            <>
              <Button size="sm" variant="primary" disabled={busy} onClick={onTakeOver}>
                {t('miningTax.corpBook.overlap.confirm')}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
              {t('miningTax.corpBook.overlap.letBill')}
            </Button>
          ))}
        {!confirming && (
          <Button size="sm" disabled={busy} onClick={onPaidAnotherWay}>
            {t('miningTax.corpBook.overlap.paidOther')}
          </Button>
        )}
      </div>
    </div>
  );
}
