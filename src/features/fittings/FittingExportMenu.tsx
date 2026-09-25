import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { writeToClipboard } from '@/lib/clipboard';
import type { MarketAppraiseState } from '@/lib/shortcuts';
import type { Fitting } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { exportFitting, type FittingExportKind } from './fittingExportText';

const NOTICE_MS = 2500;

interface Props {
  fitting: Fitting;
  /** The Fitting's Jita price (`fittingPrice.ts`); null while it loads. */
  price: Appraisal | null;
}

/**
 * The Fittings page's one Export menu (issue #1543): copy the Share Link, EFT,
 * an in-game chat link or a multibuy list, and see the Fitting's Jita price
 * with a way into Appraisal for the same list.
 */
export function FittingExportMenu({ fitting, price }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy(kind: FittingExportKind) {
    try {
      const text = await exportFitting(kind, fitting);
      if (text === null) {
        setNotice(t('fittings.export.tooLarge'));
        return;
      }
      await writeToClipboard(text);
      setNotice(t(`fittings.export.copied.${kind}`));
    } catch {
      setNotice(t('fittings.export.copyFailed'));
    }
  }

  async function openInAppraisal() {
    const text = await exportFitting('multibuy', fitting);
    if (text === null) return;
    navigate(tabPath(MARKET_TABS, 'appraisal'), {
      state: { appraiseText: text } satisfies MarketAppraiseState,
    });
  }

  return (
    <div className="flex items-center gap-2">
      {notice !== null && (
        <span role="status" className="text-xs text-text-dim">
          {notice}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>{t('fittings.export.button')}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => void copy('shareLink')}>
            {t('fittings.export.shareLink')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy('eft')}>
            {t('fittings.export.eft')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy('chatLink')}>
            {t('fittings.export.chatLink')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy('multibuy')}>
            {t('fittings.export.multibuy')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs text-text-dim">
            {price ? (
              <>
                <p>{t('fittings.stats.priceSell', { value: price.totals.sell.toFixed(0) })}</p>
                <p>{t('fittings.stats.priceBuy', { value: price.totals.buy.toFixed(0) })}</p>
              </>
            ) : (
              <p>{t('fittings.stats.priceLoading')}</p>
            )}
          </div>
          <DropdownMenuItem onSelect={() => void openInAppraisal()}>
            {t('fittings.export.appraise')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
