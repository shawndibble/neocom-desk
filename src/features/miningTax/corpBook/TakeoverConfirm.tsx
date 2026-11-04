import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { OreLine } from '@/engine/miningTax/types';
import { formatCount } from '@/lib/formatCount';
import { typeLabel } from './typeLabel';

/** One of the miner's Payees, and its ore before and after the corporation's ore comes off. */
export interface OverlapPreview {
  payeeName: string;
  before: readonly OreLine[];
  after: readonly OreLine[];
}

interface Props {
  previews: readonly OverlapPreview[];
  typeNames: ReadonlyMap<number, string>;
  busy?: boolean;
  onTakeOver: () => void;
  /** The first button's text; defaults to "Let the corporation bill it". */
  label?: string;
  /** Buttons beside "Let the corporation bill it", hidden while it asks to confirm. */
  others?: ReactNode;
}

/**
 * "Let the corporation bill it", in two steps (issue #4517): the first press shows what
 * changes on the miner's list, the second takes only that ore off. Shared by the overlap
 * notice and a Conflict day's notice, so the take-over reads and behaves the same in both.
 */
export function TakeoverConfirm({ previews, typeNames, busy, onTakeOver, label, others }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const describe = (lines: readonly OreLine[]) =>
    lines.length === 0
      ? t('miningTax.corpBook.overlap.nothingLeft')
      : lines.map((l) => `${formatCount(l.quantity)} ${typeLabel(typeNames, l.typeId)}`).join(', ');

  return (
    <>
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
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={onTakeOver}>
              {t('miningTax.corpBook.overlap.confirm')}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
              {label ?? t('miningTax.corpBook.overlap.letBill')}
            </Button>
            {others}
          </>
        )}
      </div>
    </>
  );
}
