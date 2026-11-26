import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { OreLine } from '@/engine/miningTax/types';
import { formatCount } from '@/lib/formatCount';
import { typeLabel } from './typeLabel';

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
  label?: string;
  others?: ReactNode;
}

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
            <Button
              size="sm"
              variant="primary"
              aria-disabled={busy || undefined}
              onClick={onTakeOver}
            >
              {t('miningTax.corpBook.overlap.confirm')}
            </Button>
            <Button
              size="sm"
              aria-disabled={busy || undefined}
              onClick={() => setConfirming(false)}
            >
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="warning"
              aria-disabled={busy || undefined}
              onClick={() => setConfirming(true)}
            >
              {label ?? t('miningTax.corpBook.overlap.letBill')}
            </Button>
            {others}
          </>
        )}
      </div>
    </>
  );
}
