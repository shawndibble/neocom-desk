import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Panel, RowActionsMenu, RowMoreActions, SearchInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { FittingRecord } from '@/db';
import { filterMyFittings, groupByHull } from '@/engine/fittings/myFittings';
import { FittingExportNotice } from './FittingExportMenu';
import { DeleteFittingModal, RenameFittingModal } from './SavedFittingModals';
import { savedRows, useSavedFittings } from './useLibraryFittings';
import { useLibraryRowActions } from './useLibraryRowActions';

interface MyFittingsPanelProps {
  characterId: number | null;
  /** Opens a saved Fitting in the editor. */
  onOpen: (record: FittingRecord) => void;
}

/** The saved Fittings, grouped by hull and searchable; click one to open it. */
export function MyFittingsPanel({ characterId, onOpen }: MyFittingsPanelProps) {
  const { t } = useTranslation();
  const { records, hulls } = useSavedFittings(characterId);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<FittingRecord | null>(null);
  const [deleting, setDeleting] = useState<FittingRecord | null>(null);

  const rowActions = useLibraryRowActions({
    characterId,
    onOpen: (row) => {
      if (row.source === 'saved') onOpen(row.record);
    },
    onRename: (row) => setRenaming(row.record),
    onDelete: (row) => setDeleting(row.record),
  });

  const groups = useMemo(
    () => groupByHull(filterMyFittings(savedRows(records, hulls), query)),
    [records, hulls, query]
  );

  if (characterId === null) return null;
  const total = records?.length ?? 0;

  return (
    <Panel title={t('fittings.myFittings.title')}>
      <div className="space-y-3">
        {total === 0 ? (
          <p className="text-xs text-text-dim">{t('fittings.myFittings.empty')}</p>
        ) : (
          <>
            <SearchInput
              aria-label={t('fittings.myFittings.searchLabel')}
              placeholder={t('fittings.myFittings.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {groups.length === 0 && hulls.size > 0 && (
              <p className="text-xs text-text-dim">{t('fittings.myFittings.noMatches')}</p>
            )}
            {groups.map((group) => (
              <section key={group.hull ?? ''} className="space-y-1">
                <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                  {group.hull ?? t('fittings.myFittings.unknownHull')}
                </h3>
                <ul className="divide-y divide-line">
                  {group.rows.map((row) => (
                    <RowActionsMenu key={row.id} name={row.name} items={rowActions.itemsFor(row)}>
                      <li className="flex items-center gap-2 py-1">
                        <button
                          type="button"
                          className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-text hover:text-accent"
                          aria-label={t('fittings.myFittings.open', { name: row.name })}
                          onClick={() => onOpen(row.record)}
                        >
                          {row.name}
                        </button>
                        <IconButton
                          size="sm"
                          icon={<Icon.Rename />}
                          label={t('fittings.myFittings.rename', { name: row.name })}
                          tooltip={t('fittings.myFittings.confirmRename')}
                          onClick={() => {
                            setRenaming(row.record);
                          }}
                        />
                        <IconButton
                          size="sm"
                          tone="danger"
                          icon={<Icon.Close />}
                          label={t('fittings.myFittings.delete', { name: row.name })}
                          tooltip={t('fittings.myFittings.confirmDelete')}
                          onClick={() => setDeleting(row.record)}
                        />
                        <RowMoreActions />
                      </li>
                    </RowActionsMenu>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>

      <FittingExportNotice notice={rowActions.notice} />
      {rowActions.dialog}
      <RenameFittingModal record={renaming} onClose={() => setRenaming(null)} />
      <DeleteFittingModal record={deleting} onClose={() => setDeleting(null)} />
    </Panel>
  );
}
