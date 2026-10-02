import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
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
import { useIsPhone } from '@/lib/useIsPhone';
import { loadDogmaEngine } from './dogmaFittingEngine';
import { FittingPreview } from './FittingPreview';
import { ImportFittingCard, ImportFittingDialog, NewFromHullDialog } from './FittingStartDialogs';
import { setFittingNotes } from './myFittings';
import { FittingExportNotice } from './FittingExportMenu';
import { DeleteFittingModal, RenameFittingModal } from './SavedFittingModals';
import { useLibraryRowActions } from './useLibraryRowActions';
import { fittingCompareHref } from './fittingRoutes';
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
  /** The open workspace, or the Compare picker's stand-in that returns a Share Link code. */
  workspace: FittingLibrarySource;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  /** Bumped after a Save to EVE, so In-game Fittings refetches. */
  inGameKey: number;
  /**
   * `page`: the Start screen with nothing open — New from hull and Import
   * beside the search, and on a desktop the picked row previewed beside the
   * list. `dialog`: the list alone, in the editor's "Open a fitting…" dialog
   * or the Compare picker.
   */
  variant?: 'page' | 'dialog';
  /** The page's New from hull button. */
  onStartHull?: (hull: HullEntry) => void;
  /** A dialog's Import, swapping the list for the Load card in place, so no dialog opens over a dialog. */
  importInline?: boolean;
  /** Each row's ⋮ and right-click menu (Rename, Delete, Compare, Export…). Off in the Compare picker, where a row is only ever picked. */
  rowMenus?: boolean;
  /** Called once a Fitting has been opened from here. */
  onOpened?: () => void;
  /** The route's title, for the page; this screen renders the header itself, since the In-game data age and refresh in it come from a hook only this screen holds. */
  pageTitle?: string;
  /** The page's tab bar (Ships' Fittings / Tree), drawn right under the header. */
  pageTabs?: ReactNode;
}

/**
 * Every way into a Fitting, as one list (scope decisions `20260925-152418`
 * and `20261001-210222`): one search over the Character's saved and In-game
 * Fittings, grouped by hull. On a desktop page the picked row is previewed
 * beside the list and a double-click (or Enter) opens it; everywhere else —
 * a phone, the editor's Open dialog, the Compare picker — a tap opens it.
 */
export function FittingStartScreen({
  workspace,
  catalogue,
  characterId,
  inGameKey,
  variant = 'page',
  onStartHull,
  importInline = false,
  rowMenus = true,
  onOpened,
  pageTitle,
  pageTabs,
}: FittingStartScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const page = variant === 'page';
  // A phone has no room for a preview beside the list: a tap opens instead.
  const previewing = page && !isPhone;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hullOpen, setHullOpen] = useState(false);
  // A share link that won't open lands on Import, where its message is.
  const [importOpen, setImportOpen] = useState(page && workspace.shareError !== null);
  const [renaming, setRenaming] = useState<FittingRecord | null>(null);
  const [deleting, setDeleting] = useState<FittingRecord | null>(null);

  // The same when the error arrives once this screen is up (adjusted during
  // render, not in an effect). Only the page: a dialog never pops Import by itself.
  const [seenShareError, setSeenShareError] = useState(workspace.shareError);
  if (workspace.shareError !== seenShareError) {
    setSeenShareError(workspace.shareError);
    if (page && workspace.shareError !== null) setImportOpen(true);
  }

  // Start the ship data downloading now, so a hull opened from here shows
  // its slots at once rather than after the first cold download.
  useEffect(() => {
    void loadDogmaEngine().catch(() => {
      // Stats report their own failure once a Fitting is open.
    });
  }, []);

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

  // A dialog's Import, in place of the list until Back.
  if (importInline && importOpen) {
    return (
      <div className="space-y-3">
        <Button onClick={() => setImportOpen(false)}>
          <Icon.Back aria-hidden />
          {t('fittings.start.backToList')}
        </Button>
        <ImportFittingCard workspace={workspace} onOpened={onOpened} />
      </div>
    );
  }

  // The page scrolls a phone's list itself; a dialog keeps it inside the sheet.
  const listHeight = previewing ? 'max-h-72 lg:max-h-[36rem]' : page ? '' : 'max-h-[60vh]';

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
                size={isPhone ? 'md' : 'sm'}
                icon={<Icon.Refresh />}
                label={t('fittings.inGame.refresh')}
                onClick={() => void inGame.refresh()}
                disabled={inGame.loading}
              />
            ) : undefined
          }
        />
      )}
      {pageTabs}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-64 flex-1">
          <SearchInput
            aria-label={t('fittings.start.searchFittings')}
            placeholder={t('fittings.start.searchFittingsPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {/* On a phone they share the row beneath the search, half each. */}
        <div className={`flex gap-2 ${isPhone ? 'w-full *:flex-1' : ''}`}>
          {page && onStartHull && (
            <Button variant="primary" onClick={() => setHullOpen(true)}>
              {t('fittings.start.newFromHull')}
            </Button>
          )}
          {(page || importInline) && (
            <Button onClick={() => setImportOpen(true)}>{t('fittings.start.importButton')}</Button>
          )}
        </div>
      </div>

      {inGameStatus}
      <FittingExportNotice notice={rowActions.notice} />
      {/* A picked Fitting the Compare picker couldn't turn into a Share Link. */}
      {!page && workspace.tooLargeToShare && (
        <p className="text-xs text-warning" role="status">
          {t('fittings.load.tooLargeToShare')}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('fittings.start.emptyTitle')} hint={t('fittings.start.emptyHint')} />
      ) : (
        <div
          className={`grid grid-cols-1 items-start gap-3 ${previewing ? 'lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]' : ''}`}
        >
          <nav
            aria-label={t('fittings.start.listLabel')}
            className={`overflow-y-auto border border-line bg-panel ${listHeight}`}
            onKeyDown={(event) => {
              // Arrow keys walk the list: focus moves, and with a preview the pick too.
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const focusedId = (document.activeElement as HTMLElement | null)?.dataset.rowId;
              const from = visible.findIndex(
                (row) => row.id === (previewing ? selected?.id : focusedId)
              );
              const next = visible[from + (event.key === 'ArrowDown' ? 1 : -1)];
              if (!next) return;
              event.preventDefault();
              if (previewing) setSelectedId(next.id);
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
                    const isSelected = previewing && selected?.id === row.id;
                    const item = (
                      <li className="flex items-center">
                        <button
                          type="button"
                          data-row-id={row.id}
                          aria-pressed={previewing ? isSelected : undefined}
                          onClick={() => (previewing ? setSelectedId(row.id) : open(row))}
                          onDoubleClick={previewing ? () => open(row) : undefined}
                          onKeyDown={(event) => {
                            // Enter opens, as a double-click does; Space still selects.
                            if (!previewing || event.key !== 'Enter') return;
                            event.preventDefault();
                            open(row);
                          }}
                          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 border-l-2 px-3 text-left text-sm hover:bg-panel-2 md:min-h-9 ${isSelected ? 'border-accent bg-panel-2 text-accent' : 'border-transparent'}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{row.name}</span>
                          <span className="shrink-0 border border-line-bright px-1.5 text-[0.625rem] tracking-widest text-text-dim uppercase">
                            {row.source === 'saved'
                              ? t('fittings.start.sourceSaved')
                              : t('fittings.start.sourceInGame')}
                          </span>
                        </button>
                        {rowMenus && <RowMoreActions className="shrink-0" />}
                      </li>
                    );
                    return rowMenus ? (
                      <RowActionsMenu key={row.id} name={row.name} items={rowActions.itemsFor(row)}>
                        {item}
                      </RowActionsMenu>
                    ) : (
                      <Fragment key={row.id}>{item}</Fragment>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
          {previewing &&
            (selected ? (
              <FittingPreview
                key={selected.id}
                row={selected}
                catalogue={catalogue}
                characterId={characterId}
                onOpen={() => open(selected)}
                onCompare={(code) =>
                  void navigate(fittingCompareHref(`f=${encodeURIComponent(code)}`))
                }
                onRename={() => selected.source === 'saved' && setRenaming(selected.record)}
                onDelete={() => selected.source === 'saved' && setDeleting(selected.record)}
                onSaveNotes={(notes) =>
                  selected.source === 'saved' && void setFittingNotes(selected.record, notes)
                }
              />
            ) : (
              <p className="text-sm text-text-dim">{t('fittings.start.pickToPreview')}</p>
            ))}
        </div>
      )}

      {page && onStartHull && (
        <NewFromHullDialog
          open={hullOpen}
          onClose={() => setHullOpen(false)}
          catalogue={catalogue}
          onStart={(hull) => {
            setHullOpen(false);
            onStartHull(hull);
            onOpened?.();
          }}
          onOpenPopular={async (loaded) => {
            await workspace.openLoaded(loaded);
            setHullOpen(false);
            onOpened?.();
          }}
        />
      )}
      {page && (
        <ImportFittingDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          workspace={workspace}
          onOpened={() => {
            setImportOpen(false);
            onOpened?.();
          }}
        />
      )}
      <RenameFittingModal record={renaming} onClose={() => setRenaming(null)} />
      <DeleteFittingModal record={deleting} onClose={() => setDeleting(null)} />
      {rowActions.dialog}
    </div>
  );
}
