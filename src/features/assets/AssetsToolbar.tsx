import { useTranslation } from 'react-i18next';
import { Button, LiveStatus } from '@/components/ui';
import { AssetsFilterRow } from './AssetsFilterRow';
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
  return (
    <>
      {
        <LiveStatus>
          {selectMode && selectedIds.size > 0
            ? t('assets.select.selectedCount', { count: selectedIds.size })
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
              {t('assets.select.selectedCount', { count: selectedIds.size })}
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
