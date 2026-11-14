import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import { formatCubicMetres } from '@/lib/volume';
import { AssetsFilterRow } from './AssetsFilterRow';
import { selectionTotals } from './assetSelection';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';

export function AssetsToolbar({
  assetsData,
  assetsRows,
}: {
  assetsData: AssetsData;
  assetsRows: AssetsRows;
}) {
  const { activeCharacterId, debouncedSearch, searchActive, assetsResult } = assetsData;
  const {
    selectMode,
    selectedIds,
    flatMatches,
    handleBulkAddToQuickbar,
    handleBulkAppraise,
    handleBulkCopyNames,
    handleBulkCopyWithQuantities,
    handleSelectAllInView,
    handleDeselectAll,
  } = assetsRows;
  const { t } = useTranslation();
  const { assetsByItemId, priceByTypeId, pricesReady, itemValueByItemId, volumeByTypeId } =
    assetsData;
  const totals = useMemo(
    () =>
      selectionTotals(
        selectedIds,
        assetsByItemId,
        priceByTypeId,
        itemValueByItemId,
        volumeByTypeId
      ),
    [selectedIds, assetsByItemId, priceByTypeId, itemValueByItemId, volumeByTypeId]
  );
  // "N items selected · 1.2B ISK · 4,310 m³ · 3 unpriced" (issue #6165). ISK
  // and the unpriced count wait for prices, so nothing reads unpriced while
  // they load; m³ is the part a phone drops.
  const selectionParts: { text: string; phoneHidden?: boolean }[] = [
    { text: t('assets.select.selectedCount', { count: selectedIds.size }) },
    ...(pricesReady
      ? [{ text: t('assets.select.totalIsk', { amount: formatIskCompact(totals.isk) }) }]
      : []),
    {
      text: t('assets.select.totalVolume', { volume: formatCubicMetres(totals.volume) }),
      phoneHidden: true,
    },
    ...(pricesReady && totals.unpriced > 0
      ? [{ text: t('assets.select.unpriced', { count: totals.unpriced }) }]
      : []),
  ];
  return (
    <>
      {
        <LiveStatus>
          {selectMode && selectedIds.size > 0
            ? selectionParts.map((part) => part.text).join(' · ')
            : searchActive && debouncedSearch.trim().length > 0
              ? t('assets.search.resultCount', { count: flatMatches.length })
              : null}
        </LiveStatus>
      }

      {assetsResult && <AssetsFilterRow assetsData={assetsData} assetsRows={assetsRows} />}

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
          {selectedIds.size > 0 && (
            <span aria-hidden="true" className="text-[0.6875rem] text-text-dim tabular-nums">
              {selectionParts.map((part, index) => (
                <span key={index} className={part.phoneHidden ? 'max-sm:hidden' : undefined}>
                  {index > 0 && ' · '}
                  {part.text}
                </span>
              ))}
            </span>
          )}
          <Button size="sm" onClick={handleSelectAllInView}>
            {t('assets.select.selectAllInView')}
          </Button>
          <Button size="sm" disabled={selectedIds.size === 0} onClick={handleDeselectAll}>
            {t('assets.select.deselectAll')}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                disabled={activeCharacterId === null}
                onClick={handleBulkAddToQuickbar}
              >
                {t('assets.select.addToQuickbar')}
              </Button>
              <Button size="sm" onClick={handleBulkAppraise}>
                {t('assets.select.appraise')}
              </Button>
              <Button size="sm" onClick={handleBulkCopyNames}>
                {t('assets.select.copyNames')}
              </Button>
              <Button size="sm" onClick={handleBulkCopyWithQuantities}>
                {t('assets.select.copyWithQuantities')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
