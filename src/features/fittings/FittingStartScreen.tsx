import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  TabPanel,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import type { FittingRecord } from '@/db';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import { filterMyFittings, groupByHull } from '@/engine/fittings/myFittings';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { textParam } from '@/lib/urlState';
import { useUrlParam } from '@/lib/useUrlState';
import { warmDogmaEngine } from './dogmaFittingEngine';
import { StatNote } from './StatFacts';
import { FittingPreview } from './FittingPreview';
import { ImportFittingCard, ImportFittingDialog, NewFromHullDialog } from './FittingStartDialogs';
import { FittingLibraryEmpty } from './FittingLibraryEmpty';
import type { StartHull } from '@/engine/fittings/hullCatalogue';
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
  useActiveFitting,
  useCommunityFittings,
  useInGameFittings,
  useSavedFittings,
  type LibraryRow,
} from './useLibraryFittings';

interface FittingStartScreenProps {
  /** The open workspace, or the Compare picker's stand-in that returns a Fitting Share Code. */
  workspace: FittingLibrarySource;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  /** Bumped after a Save to EVE, so In-game Fittings refetches. */
  inGameKey: number;
  /**
   * `page`: the Start screen with nothing open — New from hull and Import
   * beside the search. `dialog`: the editor's "Open a fitting" dialog or the
   * Compare picker, with neither.
   */
  variant?: 'page' | 'dialog';
  /**
   * On a desktop, the hovered or focused row previewed beside the list. On by
   * default for the page; the editor's Open dialog turns it on, the Compare
   * picker leaves it off.
   */
  preview?: boolean;
  /** The page's New from hull button. */
  onStartHull?: (hull: StartHull) => void;
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
  /** The tab bar's `tabsId` and selected tab, so the content under it is that tab's panel. */
  pageTabsPanel?: { tabsId: string; tabId: string };
}

/**
 * The page's search, in the URL as `?q=` (ADR 0015), so Back from an opened
 * Fitting returns to the list as it was searched.
 */
const QUERY_KEY = 'q';
const QUERY_PARAM = textParam();

/**
 * How long the pointer rests on a row before the preview follows it, so a
 * pointer crossing other rows on its way to the preview's buttons leaves it be.
 */
const PREVIEW_HOVER_MS = 150;

/** The content under a page tab bar as its panel; without a bar it is just the content. */
function MaybeTabPanel({
  panel,
  children,
}: {
  panel?: { tabsId: string; tabId: string };
  children: ReactNode;
}) {
  if (!panel) return <>{children}</>;
  return (
    <TabPanel {...panel} className="space-y-3">
      {children}
    </TabPanel>
  );
}

/**
 * Every way into a Fitting, as one list (scope decisions `20260925-152418`,
 * `20261001-210222` and `20261106-233825`): one search over the Character's
 * Active Fit, then their saved and In-game Fittings grouped by hull. A click
 * (or Enter) on a row opens it everywhere. On a desktop page and in the
 * editor's Open dialog, the hovered or focused row is also previewed beside
 * the list, and the preview keeps the last one when the pointer leaves.
 */
export function FittingStartScreen({
  workspace,
  catalogue,
  characterId,
  inGameKey,
  variant = 'page',
  preview = variant === 'page',
  onStartHull,
  importInline = false,
  rowMenus = true,
  onOpened,
  pageTitle,
  pageTabs,
  pageTabsPanel,
}: FittingStartScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const page = variant === 'page';
  // A phone has no room for a preview beside the list.
  const previewing = preview && !isPhone;
  // Only the page's search is URL state. A dialog's (the editor's Open, the
  // Compare picker) is a passing pick over another page's URL: written there,
  // it would outlive the dialog and come back the next time it opened.
  const [urlQuery, setUrlQuery] = useUrlParam(QUERY_KEY, QUERY_PARAM);
  const [dialogQuery, setDialogQuery] = useState('');
  const query = page ? urlQuery : dialogQuery;
  const setQuery = page ? setUrlQuery : setDialogQuery;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const [hullOpen, setHullOpen] = useState(false);
  // A Fitting Share Code that won't open lands on Import, where its message is.
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
    warmDogmaEngine();
  }, []);

  const saved = useSavedFittings(characterId);
  const inGame = useInGameFittings(characterId);
  const community = useCommunityFittings(characterId);
  const active = useActiveFitting(characterId);
  const timeZone = useTimeZone();
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
      ...(hasCharacter ? community.rows : []),
    ],
    [saved.records, saved.hulls, inGame.result, inGame.hullNames, community.rows, hasCharacter, t]
  );
  const groups = useMemo(() => groupByHull(filterMyFittings(rows, query)), [rows, query]);
  // Above the hulls, so it is the first pick.
  const activeShown = useMemo(
    () => (active.row ? filterMyFittings([active.row], query) : []),
    [active.row, query]
  );
  const visible = useMemo(
    () => [...activeShown, ...groups.flatMap((group) => group.rows)],
    [activeShown, groups]
  );
  const hasRows = rows.length > 0 || active.row !== null;
  const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null;
  const searching = query.trim() !== '';

  function open(row: LibraryRow) {
    if (row.source === 'saved') workspace.openSaved(row.record);
    // A Community's Fitting opens like an import: stated for this pilot, nothing saved until they save.
    else if (row.source === 'shared') void workspace.loadFromInput(row.shared.code);
    // The flown ship opens as an In-game Fitting does (the Compare picker has no other way in).
    else if (row.source === 'active')
      void workspace.openLoaded({
        kind: 'fitting',
        source: 'in-game',
        fitting: row.fitting,
        unresolved: [],
      });
    else void workspace.openLoaded(esiFittingToFitting(row.inGame));
    onOpened?.();
  }

  const rowActions = useLibraryRowActions({
    characterId,
    sharing: {
      communities: community.communities,
      mine: community.mine,
      onChanged: () => void community.refresh(),
    },
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

  const refreshInGameButton =
    hasCharacter && inGame.granted === true ? (
      <IconButton
        size="md"
        icon={<Icon.Refresh />}
        label={t('fittings.inGame.refresh')}
        onClick={() => {
          void inGame.refresh();
          void active.refresh();
        }}
        disabled={inGame.loading}
      />
    ) : null;

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

  /** One row of the list: a click opens it, hover or focus previews it, its menu the rest. */
  const renderRow = (row: LibraryRow) => {
    const isSelected = previewing && selected?.id === row.id;
    const item = (
      <li className="flex items-center">
        <button
          type="button"
          data-row-id={row.id}
          // A list row, not a toolbar control: a second line (hull, sharer) makes it taller than Compare.
          data-inline-height="exempt"
          aria-current={isSelected || undefined}
          onClick={() => open(row)}
          onFocus={previewing ? () => setSelectedId(row.id) : undefined}
          onPointerEnter={
            previewing
              ? (event) => {
                  // A touch has no hover: its tap opens the row.
                  if (event.pointerType === 'touch') return;
                  clearTimeout(hoverTimer.current);
                  hoverTimer.current = setTimeout(() => setSelectedId(row.id), PREVIEW_HOVER_MS);
                }
              : undefined
          }
          onPointerLeave={previewing ? () => clearTimeout(hoverTimer.current) : undefined}
          className={cx(
            'group flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm',
            rowInteractiveClassName,
            focusRingInsetClassName,
            isSelected ? `${selectedRowClassName} text-accent` : 'border-l-2 border-l-transparent'
          )}
        >
          <span className="min-w-0 flex-1 py-1">
            <span className="block truncate">{row.name}</span>
            {row.source === 'shared' && (
              <span className="block truncate text-xs text-text-dim">
                {[row.sharer ?? t('fittings.share.unknownSharer'), row.communityNames.join(', ')]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            {/* Its heading isn't its hull's, so the row names the hull. */}
            {row.source === 'active' && row.hull !== row.name && (
              <span className="block truncate text-xs text-text-dim">{row.hull}</span>
            )}
          </span>
          {row.source === 'shared' ? (
            <Tooltip
              content={t(
                row.shared.source === 'game'
                  ? 'fittings.share.tooltipAsOf'
                  : 'fittings.share.tooltipUpdated',
                {
                  name: row.sharer ?? t('fittings.share.unknownSharer'),
                  communities: row.communityNames.join(', '),
                  when: formatTimestamp(new Date(row.shared.updatedAt), timeZone),
                }
              )}
            >
              <span tabIndex={0} className="shrink-0 text-text-dim">
                <Icon.NavCommunities aria-label={t('fittings.share.sourceLabel')} role="img" />
              </span>
            </Tooltip>
          ) : row.source === 'active' ? null : (
            <span className="shrink-0 text-[0.625rem] tracking-widest text-text-dim uppercase">
              {row.source === 'saved'
                ? t('fittings.start.sourceSaved')
                : t('fittings.start.sourceInGame')}
            </span>
          )}
          {/* Without the preview pane a row opens the editor (it loads state, so no href). */}
          {!previewing && !rowMenus && (
            <Icon.Descend
              aria-hidden
              className="shrink-0 text-text-faint group-hover:text-accent"
            />
          )}
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
  };

  // Beside a preview the list scrolls in its own box, filling the page or the
  // dialog (`Modal`'s `page` placement, 90dvh) under the search; elsewhere the
  // page or the dialog's body scrolls it.
  const listHeight = !previewing
    ? ''
    : page
      ? 'max-h-72 lg:h-[calc(100dvh-11rem)] lg:max-h-none'
      : 'max-h-72 lg:h-[calc(90dvh-8rem)] lg:max-h-none';
  const showNew = page && onStartHull !== undefined;
  const showImport = page || importInline;
  const empty = !hasRows && !active.pending && !loading;
  // An empty page's New from hull sits in its empty state, beside Fit your ship.
  const showNewInToolbar = showNew && !empty;
  const startHull = (hull: StartHull) => {
    onStartHull?.(hull);
    onOpened?.();
  };

  return (
    <div className={cx('space-y-3', pageTitle && 'mx-auto max-w-page')}>
      {pageTitle && (
        <PageHeader
          title={pageTitle}
          meta={
            hasCharacter && inGame.granted === true && inGame.result ? (
              <DataAgeBadge date={inGame.result.fetchedAt} expiresAt={inGame.result.expiresAt} />
            ) : undefined
          }
          actions={refreshInGameButton ?? undefined}
        />
      )}
      {pageTabs}
      <MaybeTabPanel panel={pageTabsPanel}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-64 flex-1">
            <SearchInput
              aria-label={t('fittings.start.searchFittings')}
              placeholder={t('fittings.start.searchFittingsPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // The page's own box; a dialog's is a passing pick, not a `/` target.
              pageSearch={page}
            />
          </div>
          {/* A dialog has no page header for the In-game refresh: it sits by the search. */}
          {!pageTitle && refreshInGameButton}
          {/* On a phone they share the row beneath the search, half each. */}
          {(showNewInToolbar || showImport) && (
            <div className={`flex gap-2 ${isPhone ? 'w-full *:flex-1' : ''}`}>
              {showNewInToolbar && (
                <Button variant="primary" onClick={() => setHullOpen(true)}>
                  {t('fittings.start.newFromHull')}
                </Button>
              )}
              {showImport && (
                <Button onClick={() => setImportOpen(true)}>
                  {t('fittings.start.importAction')}
                </Button>
              )}
            </div>
          )}
        </div>

        {inGameStatus}
        <FittingExportNotice notice={rowActions.notice} />
        {/* A picked Fitting the Compare picker couldn't turn into a Fitting Share Code. The
          editor's own workspace flags its open Fitting the same way, so the Open
          dialog never shows it. */}
        {importInline && workspace.tooLargeToShare && (
          <p className="text-xs text-warning" role="status">
            {t('fittings.load.tooLargeToShare')}
          </p>
        )}

        {active.pending || (loading && !hasRows) ? (
          <Spinner block="panel" label={t('common.loading')} />
        ) : !hasRows ? (
          showNew ? (
            <FittingLibraryEmpty onNewFromHull={() => setHullOpen(true)} onStartHull={startHull} />
          ) : (
            <EmptyState
              title={t('fittings.start.emptyTitle')}
              hint={t('fittings.start.emptyHintList')}
            />
          )
        ) : (
          <div
            className={`grid grid-cols-1 items-start gap-3 ${previewing ? 'lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]' : ''}`}
          >
            <nav
              aria-label={t('fittings.start.listLabel')}
              className={`overflow-y-auto border border-line bg-panel ${listHeight}`}
              onKeyDown={(event) => {
                // Arrow keys walk the list: focus moves, and a preview follows the focus.
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                // From a row's ⋮ too, not just the row itself.
                const focusedId = document.activeElement
                  ?.closest('li')
                  ?.querySelector<HTMLElement>('[data-row-id]')?.dataset.rowId;
                const from = visible.findIndex((row) => row.id === focusedId);
                const next = visible[from + (event.key === 'ArrowDown' ? 1 : -1)];
                if (!next) return;
                event.preventDefault();
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
              {visible.length === 0 && (
                <p className="p-3 text-xs text-text-dim">{t('fittings.start.noMatches')}</p>
              )}
              {activeShown.length > 0 && (
                <section className="pb-1">
                  <h3 className={cx(eyebrowClassName, 'px-3 pt-3 pb-1')}>
                    {t('fittings.start.activeHeading')}
                  </h3>
                  <ul>{activeShown.map(renderRow)}</ul>
                  <div className="px-3 pt-1">
                    <StatNote>{t('fittings.start.activeLag')}</StatNote>
                  </div>
                </section>
              )}
              {groups.map((group) => (
                <section key={group.hull ?? ''} className="pb-1">
                  <h3 className={cx(eyebrowClassName, 'px-3 pt-3 pb-1')}>
                    {group.hull ?? t('fittings.myFittings.unknownHull')}
                  </h3>
                  <ul>{group.rows.map(renderRow)}</ul>
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
      </MaybeTabPanel>

      {showNew && (
        <NewFromHullDialog
          open={hullOpen}
          onClose={() => setHullOpen(false)}
          catalogue={catalogue}
          onStart={(hull) => {
            setHullOpen(false);
            startHull(hull);
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
