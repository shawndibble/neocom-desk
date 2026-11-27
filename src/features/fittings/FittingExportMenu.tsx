import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LiveNote,
  Spinner,
} from '@/components/ui';
import type { Fitting } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import { formatIsk } from '@/lib/isk';
import { useHubFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import type { EditorShare } from './useEditorShare';
import { useFittingExport, type FittingExport } from './useFittingExport';

interface Props {
  fitting: Fitting;
  price: Appraisal | null;
  cloneImplants?: readonly number[];
  share?: EditorShare;
}

export function FittingExportNotice({ notice }: { notice: string | null }) {
  if (notice === null) return null;
  return (
    <LiveNote as="span" className="text-xs text-text-dim">
      {notice}
    </LiveNote>
  );
}

export function FittingExportItems({
  actions: {
    canSubtractOwned,
    copy,
    copyMultibuyMinusOwned,
    copyShareLink,
    downloadEveXml,
    openInAppraisal,
    openManufacturePlan,
  },
  price,
  share,
}: {
  actions: FittingExport;
  price: Appraisal | null;
  share?: ReactNode;
}) {
  const { t } = useTranslation();
  const { hubId } = useHubFor('fittings');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  return (
    <>
      <DropdownMenuItem onSelect={() => void copyShareLink()}>
        {t('fittings.export.shareLink')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void copy('eft')}>
        {t('fittings.export.eft')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void copy('multibuy')}>
        {t('fittings.export.multibuy')}
      </DropdownMenuItem>
      {canSubtractOwned && (
        <DropdownMenuItem onSelect={() => void copyMultibuyMinusOwned()}>
          {t('fittings.export.multibuyMinusOwned')}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => void downloadEveXml()}>
        {t('fittings.export.eveXml')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void openManufacturePlan()}>
        {t('fittings.export.manufacturePlan')}
      </DropdownMenuItem>
      {share}
      <DropdownMenuSeparator />
      <div className="px-2 py-1.5 text-xs text-text-dim">
        {price ? (
          <p>
            {t('fittings.stats.priceSell', {
              hub: hub.systemName,
              value: formatIsk(price.totals.sell),
            })}
          </p>
        ) : (
          <Spinner size="sm" showLabel label={t('fittings.stats.priceLoading')} />
        )}
      </div>
      <DropdownMenuItem onSelect={() => void openInAppraisal()}>
        {t('fittings.export.appraise')}
      </DropdownMenuItem>
    </>
  );
}

export function FittingExportMenu({ fitting, price, cloneImplants, share }: Props) {
  const { t } = useTranslation();
  const actions = useFittingExport(fitting, cloneImplants);
  return (
    <div className="flex items-center gap-2">
      <FittingExportNotice notice={actions.notice ?? share?.notice ?? null} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>{t('fittings.export.button')}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <FittingExportItems actions={actions} price={price} share={share?.items} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
