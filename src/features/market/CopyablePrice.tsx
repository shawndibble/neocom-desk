import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@/components/ui';
import { Toast } from '@/components/ui/Toast';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { writeToClipboard } from '@/lib/clipboard';
import { formatMarketIsk } from '@/lib/isk';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { priceClipboardText } from './priceClipboardText';

const COPIED_FEEDBACK_MS = 2000;

function useCopyPrice(price: number): { copied: boolean; copy: () => Promise<void> } {
  const { copied, flash } = useCopyFeedback(COPIED_FEEDBACK_MS);

  async function copy() {
    await writeToClipboard(priceClipboardText(price));
    flash();
  }

  return { copied: copied === true, copy };
}

export function CopyablePrice({ price, children }: { price: number; children?: ReactNode }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyPrice(price);

  const formatted = formatMarketIsk(price);

  return (
    <>
      <Tooltip content={t('market.orders.copyPrice', { price: formatted })}>
        <button
          type="button"
          onClick={() => void copy()}
          className={`inline-flex min-h-9 cursor-copy items-center rounded-xs text-left font-semibold hover:text-accent md:min-h-0 ${interactiveClassName} ${focusRingClassName}`}
        >
          {children ?? formatted}
        </button>
      </Tooltip>
      {copied && <Toast message={t('market.orders.priceCopied')} />}
    </>
  );
}

export function CopyPriceButton({ price, className }: { price: number; className?: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyPrice(price);
  return (
    <>
      <Button variant="primary" className={className} onClick={() => void copy()}>
        {t('market.orders.copyPrice', { price: formatMarketIsk(price) })}
      </Button>
      {copied && <Toast message={t('market.orders.priceCopied')} />}
    </>
  );
}
