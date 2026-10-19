import {
  DataAgeBadge,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  PageHeader,
  Spinner,
} from '@/components/ui';
import { WalletOriginCrumb } from '@/features/character/WalletOriginCrumb';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { formatAge } from '@/lib/age';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTranslation } from 'react-i18next';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';

export function AssetsPageHeader({
  tab,
  assetsData,
  assetsRows,
}: {
  tab: string;
  assetsData: AssetsData;
  assetsRows: AssetsRows;
}) {
  const {
    loading,
    refresh,
    setView,
    crossCharacterLoading,
    allItemsView,
    viewedCharacter,
    crossCharacterFilterMeta,
    otherCharacterIds,
    activeCrossCharacterData,
    assetsResult,
    assetsExport,
  } = assetsData;
  const { selectMode, toggleSelectMode } = assetsRows;
  const { t } = useTranslation();
  return (
    <PageHeader
      title={t('assets.title')}
      // `CharacterFilterControl` rides here rather than in `actions` per
      // `docs/context/decisions/20260908-192806-the-character-filter-rides-in-the-panel-header.md`
      // — Assets has no titled inner `Panel` to attach it to, so it takes
      // the page-level title band instead, the same "names whose data this
      // is" role the decision describes for a panel's own `meta`.
      meta={
        <>
          <WalletOriginCrumb />
          {viewedCharacter && (
            <CharacterScopeReadout
              scope="one"
              characterId={viewedCharacter.characterId}
              characterName={viewedCharacter.name}
            />
          )}
          {assetsResult && <DataAgeBadge date={assetsResult.fetchedAt} />}
          {crossCharacterFilterMeta}
          {activeCrossCharacterData && activeCrossCharacterData.skipped.length > 0 && (
            <CharacterScopeReadout
              scope="all"
              total={
                activeCrossCharacterData.entries.length +
                activeCrossCharacterData.skipped.length +
                1
              }
              missing={activeCrossCharacterData.skipped.map((c) => c.name)}
            />
          )}
          {otherCharacterIds.length > 0 && crossCharacterLoading && (
            <Spinner size="sm" label={t('assets.crossCharacterLoading')} />
          )}
        </>
      }
      actions={
        <>
          {tab === 'items' && (
            <div className="ml-auto flex items-center gap-1.5">
              <TableActionsMenu
                name={t('assets.title')}
                label={t('assets.tools.label')}
                triggerText={t('assets.tools.label')}
                tableExport={assetsExport}
                size="md"
              >
                <DropdownMenuLabel>{t('assets.tools.view')}</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={allItemsView}
                  onCheckedChange={(on) => setView({ all: on })}
                >
                  {t('assets.allItemsToggle')}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={selectMode} onCheckedChange={toggleSelectMode}>
                  {t('assets.select.toggle')}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={loading} onSelect={refresh}>
                  {t('assets.refresh')}
                  {assetsResult && (
                    <span className="ml-auto pl-3 text-text-dim">
                      {/* eslint-disable-next-line react-hooks/purity -- age label of cached data; a render-time clock read is the intent */}
                      {formatAge(Date.now() - new Date(assetsResult.fetchedAt).getTime(), t)}
                    </span>
                  )}
                </DropdownMenuItem>
              </TableActionsMenu>
            </div>
          )}
        </>
      }
    />
  );
}
