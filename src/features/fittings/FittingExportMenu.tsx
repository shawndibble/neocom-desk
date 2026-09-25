import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import type { Fitting } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { useFittingExport, type FittingExport } from './useFittingExport';

interface Props {
  fitting: Fitting;
  /** The Fitting's Jita price (`fittingPrice.ts`); null while it loads. */
  price: Appraisal | null;
}

/** The notice a copy leaves, announced politely. */
export function FittingExportNotice({ notice }: { notice: string | null }) {
  if (notice === null) return null;
  return (
    <span role="status" className="text-xs text-text-dim">
      {notice}
    </span>
  );
}

/** Export's menu items, for whichever menu holds them. */
export function FittingExportItems({
  actions: { copy, downloadEveXml, openInAppraisal },
  price,
}: {
  actions: FittingExport;
  price: Appraisal | null;
}) {
  const { t } = useTranslation();
  return (
    <>
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
      <DropdownMenuItem onSelect={() => void downloadEveXml()}>
        {t('fittings.export.eveXml')}
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
    </>
  );
}

/**
 * The Fittings page's one Export menu (issue #1543): copy the Share Link, EFT,
 * an in-game chat link or a multibuy list, and see the Fitting's Jita price
 * with a way into Appraisal for the same list.
 */
export function FittingExportMenu({ fitting, price }: Props) {
  const { t } = useTranslation();
  const actions = useFittingExport(fitting);
  return (
    <div className="flex items-center gap-2">
      <FittingExportNotice notice={actions.notice} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>{t('fittings.export.button')}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <FittingExportItems actions={actions} price={price} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
