import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { LiveNote } from '@/components/ui/LiveStatus';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TabPanel,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import type { FittingRecord } from '@/db';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import {
  effectiveSource,
  filterBySource,
  filterMyFittings,
  groupByHull,
  LIBRARY_SOURCES,
  librarySources,
  type LibrarySource,
  type LibrarySourcePick,
} from '@/engine/fittings/myFittings';
import { useIsPhone } from '@/lib/useIsPhone';
import { NO_HOVER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { enumParam, textParam } from '@/lib/urlState';
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
import { useCorpDoctrineFittings } from './corpDoctrineFittings';

interface FittingStartScreenProps {
  workspace: FittingLibrarySource;
  catalogue: FittingCatalogue | null;
  characterId: number | null;
  inGameKey: number;
  variant?: 'page' | 'dialog';
  preview?: boolean;
  onStartHull?: (hull: StartHull) => void;
  importInline?: boolean;
  rowMenus?: boolean;
  onOpened?: () => void;
  pageTitle?: string;
  pageTabs?: ReactNode;
  pageTabsPanel?: { tabsId: string; tabId: string };
}

export const LIST_PREVIEW_DELAY_MS = 275;

const QUERY_KEY = 'q';
const QUERY_PARAM = textParam();
const SOURCE_KEY = 'source';
const SOURCE_PARAM = enumParam(['all', ...LIBRARY_SOURCES] as const, 'all');
const SOURCE_LABEL: Record<LibrarySourcePick, string> = {
  all: 'fittings.start.allSources',
  saved: 'fittings.start.sourceSaved',
  inGame: 'fittings.start.sourceInGame',
  shared: 'fittings.start.sourceShared',
  doctrine: 'fittings.start.sourceDoctrine',
};

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
  const noHover = useMediaQuery(NO_HOVER_QUERY);
  const previewing = preview && !isPhone && !noHover;
  const [urlQuery, setUrlQuery] = useUrlParam(QUERY_KEY, QUERY_PARAM);
  const [dialogQuery, setDialogQuery] = useState('');
  const query = page ? urlQuery : dialogQuery;
  const setQuery = page ? setUrlQuery : setDialogQuery;
  const [urlSource, setUrlSource] = useUrlParam(SOURCE_KEY, SOURCE_PARAM);
  const [dialogSource, setDialogSource] = useState<LibrarySourcePick>('all');
  const pickedSource = page ? urlSource : dialogSource;
  const setSource = page ? setUrlSource : setDialogSource;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hover = useRef<{ rowId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelHover = () => {
    clearTimeout(hover.current?.timer);
    hover.current = null;
  };
  useEffect(() => () => clearTimeout(hover.current?.timer), []);
  const [hullOpen, setHullOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(page && workspace.shareError !== null);
  const [renaming, setRenaming] = useState<FittingRecord | null>(null);
  const [deleting, setDeleting] = useState<FittingRecord | null>(null);

  const [seenShareError, setSeenShareError] = useState(workspace.shareError);
  if (workspace.shareError !== seenShareError) {
    setSeenShareError(workspace.shareError);
    if (page && workspace.shareError !== null) setImportOpen(true);
  }

  useEffect(() => {
    warmDogmaEngine();
  }, []);

  const saved = useSavedFittings(characterId);
  const inGame = useInGameFittings(characterId);
  const community = useCommunityFittings(characterId);
  const active = useActiveFitting(characterId);
  const doctrine = useCorpDoctrineFittings(characterId);
  const timeZone = useTimeZone();
  const hasCharacter = characterId !== null;
  const { refresh: refreshInGame } = inGame;
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
      ...(hasCharacter ? doctrine.rows : []),
    ],
    [
      saved.records,
      saved.hulls,
      inGame.result,
      inGame.hullNames,
      community.rows,
      doctrine.rows,
      hasCharacter,
      t,
    ]
  );
  const sources = useMemo<LibrarySource[]>(
    () => librarySources(active.row ? [...rows, active.row] : rows),
    [rows, active.row]
  );
  const source = effectiveSource(pickedSource, sources);
  const groups = useMemo(
    () => groupByHull(filterMyFittings(filterBySource(rows, source), query)),
    [rows, source, query]
  );
  const activeShown = useMemo(
    () => (active.row ? filterMyFittings(filterBySource([active.row], source), query) : []),
    [active.row, source, query]
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
    else if (row.source === 'shared') void workspace.loadFromInput(row.shared.code);
    else if (row.source === 'doctrine') void workspace.loadFromInput(row.code);
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
      <GrantBanner characterId={characterId} endpoints={['getCharacterFittings']} />
    ) : hasCharacter && inGame.error ? (
      <p className="text-xs text-warning">{t('common.loadFailedHint')}</p>
    ) : null;

  const savedPending =
    hasCharacter && (saved.records === undefined || saved.hulls.size < saved.records.length);
  const loading =
    savedPending ||
    (hasCharacter && (inGame.granted === undefined || (inGame.loading && !inGame.result)));
  const sourcesSettled =
    !loading && !active.pending && (!hasCharacter || (community.settled && doctrine.settled));
  const urlSourceDead = page && sourcesSettled && urlSource !== 'all' && urlSource !== source;
  useEffect(() => {
    if (urlSourceDead) setUrlSource('all');
  }, [urlSourceDead, setUrlSource]);

  const refreshInGameButton =
    hasCharacter && inGame.granted === true ? (
      <IconButton
        size="md"
        icon={<Icon.Refresh />}
        label={t('fittings.inGame.refresh')}
        onClick={() => {
          void inGame.refresh();
          void active.refresh();
          void doctrine.refresh();
        }}
        busy={inGame.loading}
      />
    ) : null;

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

  const renderRow = (row: LibraryRow) => {
    const isSelected = previewing && selected?.id === row.id;
    const item = (
      <li className="flex items-center">
        <button
          type="button"
          data-row-id={row.id}
          data-inline-height="exempt"
          aria-current={isSelected || undefined}
          onClick={() => open(row)}
          onFocus={
            previewing
              ? () => {
                  cancelHover();
                  setSelectedId(row.id);
                }
              : undefined
          }
          onPointerMove={
            previewing
              ? (event) => {
                  if (event.pointerType === 'touch' || isSelected) return;
                  if (hover.current?.rowId === row.id) return;
                  cancelHover();
                  hover.current = {
                    rowId: row.id,
                    timer: setTimeout(() => setSelectedId(row.id), LIST_PREVIEW_DELAY_MS),
                  };
                }
              : undefined
          }
          onPointerLeave={previewing ? cancelHover : undefined}
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
            {row.source === 'doctrine' && row.legacy && !previewing && (
              <span className="block text-xs text-text-dim">
                {t('fittings.start.doctrineLegacy')}
              </span>
            )}
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
            <span className="shrink-0 text-[0.6875rem] tracking-widest text-text-dim uppercase">
              {row.source === 'saved'
                ? t('fittings.start.sourceSaved')
                : row.source === 'doctrine'
                  ? t('fittings.start.sourceDoctrine')
                  : t('fittings.start.sourceInGame')}
            </span>
          )}
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

  const listHeight = !previewing
    ? ''
    : page
      ? 'max-h-72 lg:h-[calc(100dvh-11rem)] lg:max-h-none'
      : 'max-h-72 lg:h-[calc(90dvh-8rem)] lg:max-h-none';
  const showNew = page && onStartHull !== undefined;
  const showImport = page || importInline;
  const empty = !hasRows && !active.pending && !loading;
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
          <div className="flex min-w-64 flex-1 gap-2">
            <div className="min-w-0 flex-1">
              <SearchInput
                aria-label={t('fittings.start.searchFittings')}
                placeholder={t('fittings.start.searchFittingsPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                pageSearch={page}
              />
            </div>
            {sources.length > 1 && (
              <Select
                value={source}
                onValueChange={(value) => setSource(value as LibrarySourcePick)}
              >
                <SelectTrigger
                  active={source !== 'all'}
                  aria-label={t('fittings.start.sourceFilter')}
                  className="w-32 shrink-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['all', ...sources] as const).map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(SOURCE_LABEL[option])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!pageTitle && refreshInGameButton}
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
        {importInline && workspace.tooLargeToShare && (
          <LiveNote className="text-xs text-warning">{t('fittings.load.tooLargeToShare')}</LiveNote>
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
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
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
                <LiveNote className="border-b border-line px-3 py-2 text-xs text-text-dim">
                  {t('fittings.start.matches', { count: visible.length })}
                </LiveNote>
              )}
              {visible.length === 0 &&
                (source === 'all' ? (
                  <EmptyState title={t('fittings.start.noMatches')} />
                ) : (
                  <EmptyState
                    title={t('fittings.start.noMatchesInSource', {
                      source: t(SOURCE_LABEL[source]),
                    })}
                    action={
                      <Button size="sm" onClick={() => setSource('all')}>
                        {t('fittings.start.showAllSources')}
                      </Button>
                    }
                  />
                ))}
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
