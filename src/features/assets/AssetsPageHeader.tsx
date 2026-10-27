import {
  DataAgeBadge,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  PageHeader,
} from '@/components/ui';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { formatAge } from '@/lib/age';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTranslation } from 'react-i18next';
import { useIsNarrow } from '@/lib/useIsNarrow';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';

export function AssetsPageHeader({
  tab,
  assetsData,
  assetsRows,
  tabMissingNames,
}: {
  tab: string;
  assetsData: AssetsData;
  assetsRows: AssetsRows;
  /** Who the Ships or Move tab's own read left out (`useReportSkipped`); Items uses its search's. */
  tabMissingNames?: readonly string[];
}) {
  const {
    loading,
    refresh,
    setView,
    crossCharacterLoading,
    allItemsView,
    viewedCharacter,
    viewedCharacterId,
    activeCharacterId,
    crossCharacterFilter,
    shipsFilterIsAll,
    crossCharacterCandidates,
    otherCharacterIds,
    activeCrossCharacterData,
    assetsResult,
    assetsExport,
  } = assetsData;
  const { selectMode, toggleSelectMode } = assetsRows;
  const { t } = useTranslation();
  const isNarrow = useIsNarrow();
  // One picker for all three tabs. Absent while a `?char=<id>` link names the
  // page's Character (a fixed subject, named in `meta` instead) and for a
  // one-Character account, where both options resolve to the same pilot.
  const scope =
    viewedCharacterId === undefined && crossCharacterCandidates.length > 1 ? (
      <CharacterFilterControl
        activeCharacterId={activeCharacterId}
        value={crossCharacterFilter}
        onChange={(chars: CharacterFilterValue) => setView({ chars })}
        characterCount={crossCharacterCandidates.length}
        missingNames={
          tab === 'items'
            ? activeCrossCharacterData?.skipped.map((c) => c.name)
            : // Only "All" leaves anyone out; a This-character read that failed is the tab's own error.
              shipsFilterIsAll
              ? tabMissingNames
              : undefined
        }
        loading={otherCharacterIds.length > 0 && crossCharacterLoading}
      />
    ) : undefined;
  return (
    <PageHeader
      title={t('assets.title')}
      meta={
        <>
          {viewedCharacter && (
            <CharacterScopeReadout
              scope="one"
              characterId={viewedCharacter.characterId}
              characterName={viewedCharacter.name}
            />
          )}
          {assetsResult && <DataAgeBadge date={assetsResult.fetchedAt} />}
        </>
      }
      scope={scope}
      actions={
        <>
          {tab === 'items' && (
            <div className="flex items-center gap-1.5">
              <TableActionsMenu
                name={t('assets.title')}
                label={t('assets.tools.label')}
                // Below `md` the word wrapped the title row (a `?char=` link's
                // "<name> only" readout beside it): the menu takes its icon-only ⋮ form.
                triggerText={isNarrow ? undefined : t('assets.tools.label')}
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
