import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  RowActionsMenu,
  RowMoreActions,
  SearchInput,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import type { FittingRecord } from '@/db';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import type { HullEntry } from '@/engine/fittings/hullCatalogue';
import { filterMyFittings, groupByHull } from '@/engine/fittings/myFittings';
import { FittingLoadCard } from './FittingLoadCard';
import { FittingPreview } from './FittingPreview';
import { HullPicker } from './HullPicker';
import { setFittingNotes } from './myFittings';
import { FittingExportNotice } from './FittingExportMenu';
import { DeleteFittingModal, RenameFittingModal } from './SavedFittingModals';
import { useLibraryRowActions } from './useLibraryRowActions';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingLibrarySource } from './useFittingPicker';
import {
  inGameRows,
  savedRows,
  useInGameFittings,
  useSavedFittings,
  type LibraryRow,
} from './useLibraryFittings';

interface FittingStartScreenProps {
  workspace: FittingLibrarySource;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  /** Bumped after a Save to EVE, so In-game Fittings refetches. */
  inGameKey: number;
  onStartHull: (hull: HullEntry) => void;
  onOpened?: () => void;
  /** The route's title. This screen renders the page header itself, since the In-game data age and refresh in it come from a hook only this screen holds. */
  pageTitle?: string;
}

/**
 * The Fittings page with nothing open (scope decision `20260925-152418`): one
 * search over the Character's saved and In-game Fittings, grouped by hull,
 * with the picked one previewed beside the list. Starting from a hull and
 * importing sit behind the two buttons beside the search.
 */
export function FittingStartScreen({
  workspace,
  catalogue,
  characterId,
  inGameKey,
  onStartHull,
  onOpened,
  pageTitle,
}: FittingStartScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hullOpen, setHullOpen] = useState(false);
  // A share link that won't open lands on Import, where its message is.
  const [importOpen, setImportOpen] = useState(workspace.shareError !== null);
  const [renaming, setRenaming] = useState<FittingRecord | null>(null);
  const [deleting, setDeleting] = useState<FittingRecord | null>(null);

  // The same when the error arrives once this screen is up (adjusted during
  // render, not in an effect).
  const [seenShareError, setSeenShareError] = useState(workspace.shareError);
  if (workspace.shareError !== seenShareError) {
    setSeenShareError(workspace.shareError);
    if (workspace.shareError !== null) setImportOpen(true);
  }

  const saved = useSavedFittings(characterId);
  const inGame = useInGameFittings(characterId);
  const hasCharacter = characterId !== null;
  const { refresh: refreshInGame } = inGame;
  // Save to EVE landed: pick up the fitting that just arrived.
  useEffect(() => {
    if (inGameKey > 0 && hasCharacter) void refreshInGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh() is recreated every render; the key is the trigger
  }, [inGameKey]);

  const rows = useMemo<LibraryRow[]>(
    () => [
      ...savedRows(saved.records, saved.hulls),
      ...(hasCharacter
        ? inGameRows(inGame.result?.data ?? [], inGame.hullNames, (id) =>
            t('common.unknownType', { id })
          )
        : []),
    ],
    [saved.records, saved.hulls, inGame.result, inGame.hullNames, hasCharacter, t]
  );
  const groups = useMemo(() => groupByHull(filterMyFittings(rows, query)), [rows, query]);
  const visible = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null;
  const searching = query.trim() !== '';

  function open(row: LibraryRow) {
    if (row.source === 'saved') workspace.openSaved(row.record);
    else void workspace.openLoaded(esiFittingToFitting(row.inGame));
    onOpened?.();
  }

  const rowActions = useLibraryRowActions({
    characterId,
    onOpen: open,
    onRename: (row) => setRenaming(row.record),
    onDelete: (row) => setDeleting(row.record),
  });

  const inGameStatus =
    hasCharacter && inGame.granted === false ? (
      <GrantBanner
        characterId={characterId}
        endpoints={['getCharacterFittings']}
        title={t('fittings.inGame.reauthTitle')}
        hint={t('fittings.inGame.reauthHint')}
        actionLabel={t('fittings.inGame.reauthAction')}
      />
    ) : hasCharacter && inGame.error ? (
      <p className="text-xs text-warning">{t('common.loadFailedHint')}</p>
    ) : null;

  // Saved Fittings still being read or their hulls decoded, or In-game ones still loading:
  // "No fittings yet" must not flash before either lands.
  const savedPending =
    hasCharacter && (saved.records === undefined || saved.hulls.size < saved.records.length);
  const loading =
    savedPending ||
    (hasCharacter && (inGame.granted === undefined || (inGame.loading && !inGame.result)));

  return (
    <div className="space-y-3">
      {pageTitle && (
        <PageHeader
          title={pageTitle}
          meta={
            hasCharacter && inGame.granted === true && inGame.result ? (
              <DataAgeBadge date={inGame.result.fetchedAt} />
            ) : undefined
          }
          actions={
            hasCharacter && inGame.granted === true ? (
              <IconButton
                size="sm"
                icon={<Icon.Refresh />}
                label={t('fittings.inGame.refresh')}
                onClick={() => void inGame.refresh()}
                disabled={inGame.loading}
              />
            ) : undefined
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-64 flex-1">
          <SearchInput
            aria-label={t('fittings.start.searchFittings')}
            placeholder={t('fittings.start.searchFittingsPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button variant="primary" onClick={() => setHullOpen(true)}>
          {t('fittings.start.newFromHull')}
        </Button>
        <Button onClick={() => setImportOpen(true)}>{t('fittings.start.importButton')}</Button>
      </div>

      {inGameStatus}
      <FittingExportNotice notice={rowActions.notice} />

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('fittings.start.emptyTitle')} hint={t('fittings.start.emptyHint')} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <nav
            aria-label={t('fittings.start.listLabel')}
            className="max-h-72 overflow-y-auto border border-line bg-panel lg:max-h-[36rem]"
            onKeyDown={(event) => {
              // Arrow keys walk the list: selection and focus move together.
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const from = visible.findIndex((row) => row.id === selected?.id);
              const next = visible[from + (event.key === 'ArrowDown' ? 1 : -1)];
              if (!next) return;
              event.preventDefault();
              setSelectedId(next.id);
              event.currentTarget
                .querySelector<HTMLElement>(`[data-row-id="${CSS.escape(next.id)}"]`)
                ?.focus();
            }}
          >
            {searching && (
              <p className="border-b border-line px-3 py-2 text-xs text-text-dim" role="status">
                {t('fittings.start.matches', { count: visible.length })}
              </p>
            )}
            {groups.length === 0 && (
              <p className="p-3 text-xs text-text-dim">{t('fittings.start.noMatches')}</p>
            )}
            {groups.map((group) => (
              <section key={group.hull ?? ''} className="pb-1">
                <h3 className="px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {group.hull ?? t('fittings.myFittings.unknownHull')}
                </h3>
                <ul>
                  {group.rows.map((row) => {
                    const isSelected = selected?.id === row.id;
                    return (
                      <RowActionsMenu key={row.id} name={row.name} items={rowActions.itemsFor(row)}>
                        <li className="flex items-center">
                          <button
                            type="button"
                            data-row-id={row.id}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedId(row.id)}
                            onDoubleClick={() => open(row)}
                            onKeyDown={(event) => {
                              // Enter opens, as a double-click does; Space still selects.
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              open(row);
                            }}
                            className={`flex min-h-11 w-full items-center gap-2 border-l-2 px-3 text-left text-sm hover:bg-panel-2 md:min-h-9 ${isSelected ? 'border-accent bg-panel-2 text-accent' : 'border-transparent'}`}
                          >
                            <span className="min-w-0 flex-1 truncate">{row.name}</span>
                            <span className="shrink-0 border border-line-bright px-1.5 text-[0.625rem] tracking-widest text-text-dim uppercase">
                              {row.source === 'saved'
                                ? t('fittings.start.sourceSaved')
                                : t('fittings.start.sourceInGame')}
                            </span>
                          </button>
                          <RowMoreActions />
                        </li>
                      </RowActionsMenu>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
          {selected ? (
            <FittingPreview
              key={selected.id}
              row={selected}
              catalogue={catalogue}
              characterId={characterId}
              onOpen={() => open(selected)}
              onCompare={(code) => void navigate(`/fittings/compare?f=${encodeURIComponent(code)}`)}
              onRename={() => selected.source === 'saved' && setRenaming(selected.record)}
              onDelete={() => selected.source === 'saved' && setDeleting(selected.record)}
              onSaveNotes={(notes) =>
                selected.source === 'saved' && void setFittingNotes(selected.record, notes)
              }
            />
          ) : (
            <p className="text-sm text-text-dim">{t('fittings.start.pickToPreview')}</p>
          )}
        </div>
      )}

      <Modal
        open={hullOpen}
        onClose={() => setHullOpen(false)}
        title={t('fittings.start.newTitle')}
      >
        <HullPicker
          catalogue={catalogue}
          onStart={(hull) => {
            setHullOpen(false);
            onStartHull(hull);
            onOpened?.();
          }}
        />
      </Modal>
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('fittings.start.importButton')}
      >
        <FittingLoadCard
          bare
          onLoad={workspace.loadFromInput}
          lastLoad={workspace.lastLoad}
          shareError={workspace.shareError}
          tooLargeToShare={workspace.tooLargeToShare}
          onLoadFittingXmlDocument={workspace.loadFittingXmlDocument}
          onOpenLoaded={async (loaded) => {
            await workspace.openLoaded(loaded);
            setImportOpen(false);
            onOpened?.();
          }}
        />
      </Modal>
      <RenameFittingModal record={renaming} onClose={() => setRenaming(null)} />
      <DeleteFittingModal record={deleting} onClose={() => setDeleting(null)} />
      {rowActions.dialog}
    </div>
  );
}
