import { useMemo, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, IskAmount, LiveStatus, Tooltip } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import { formatCubicMetres } from '@/lib/volume';
import { AssetsFilterRow } from './AssetsFilterRow';
import { selectionTotals } from './assetSelection';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';
import { Well } from '@/components/ui/Well';

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
  const selectionParts: { text: string; shown?: ReactNode; phoneHidden?: boolean }[] = [
    { text: t('assets.select.selectedCount', { count: selectedIds.size }) },
  ];
  if (pricesReady) {
    selectionParts.push({
      text: t('assets.select.totalIsk', { amount: formatIskCompact(totals.isk) }),
      shown: (
        <Trans
          i18nKey="assets.select.totalIskShown"
          components={{ isk: <IskAmount value={totals.isk} /> }}
        />
      ),
    });
  }
  selectionParts.push({
    text: t('assets.select.totalVolume', { volume: formatCubicMetres(totals.volume) }),
    phoneHidden: true,
  });
  if (pricesReady && totals.unpriced > 0) {
    selectionParts.push({ text: t('assets.select.unpriced', { count: totals.unpriced }) });
  }
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
        <Well size="flat" className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="whitespace-nowrap text-[0.6875rem] text-text-dim tabular-nums">
              {selectionParts.map((part, index) => (
                <span
                  key={index}
                  aria-hidden={part.shown ? undefined : 'true'}
                  className={part.phoneHidden ? 'max-sm:hidden' : undefined}
                >
                  {index > 0 && ' · '}
                  {part.shown ?? part.text}
                </span>
              ))}
            </span>
          )}
          <Button size="sm" onClick={handleSelectAllInView}>
            {t('assets.select.selectAllInView')}
          </Button>
          <Tooltip content={selectedIds.size === 0 ? t('assets.select.deselectAllEmpty') : null}>
            <Button
              size="sm"
              aria-disabled={selectedIds.size === 0 || undefined}
              onClick={handleDeselectAll}
            >
              {t('assets.select.deselectAll')}
            </Button>
          </Tooltip>
          {selectedIds.size > 0 && (
            <>
              <Tooltip
                content={
                  activeCharacterId === null ? t('market.contextMenu.quickbarNoCharacter') : null
                }
              >
                <Button
                  size="sm"
                  aria-disabled={activeCharacterId === null || undefined}
                  onClick={handleBulkAddToQuickbar}
                >
                  {t('assets.select.addToQuickbar')}
                </Button>
              </Tooltip>
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
        </Well>
      )}
    </>
  );
}
