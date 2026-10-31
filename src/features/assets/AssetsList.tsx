import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  IconButton,
  IskAmount,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner, GrantNote } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useIsPhone } from '@/lib/useIsPhone';
import type { CharacterAsset } from '@/esi/endpoints';
import { TableExportProvider } from '@/components/ui/TableExport';
import {
  abyssalItemRefs,
  summarizeAbyssal,
  type AbyssalSummary,
} from '@/engine/market/abyssalValuation';
import { AbyssalValueNote } from '@/features/abyssal/AbyssalValueNote';
import { formatIsk } from '@/lib/isk';
import { collectItemIds, collectStationItemIds, type StationSortField } from '@/engine/assetTree';
import { assetNodeSegment } from '@/engine/assetPath';
import { ItemColumnLabels, JumpsAwayText, SecurityValue } from '@/features/assets/assetBrowserRows';
import { BrowseRowView } from '@/features/assets/AssetBrowseRows';
import { StationHeading } from '@/features/assets/StationHeading';
import {
  AssetItemActionsContext,
  assetHref,
  isUnresolvedParent,
} from '@/features/assets/assetBrowseModel';
import { assetShipEditLocation } from '@/features/fittings/assetShipLocation';
import { useOpenInFittings } from '@/features/fittings/useOpenInFittings';
import { LOCATION_ENDPOINTS } from './useAssetsData';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';

export function AssetsList({
  assetsData,
  assetsRows,
  query,
}: {
  assetsData: AssetsData;
  assetsRows: AssetsRows;
  query: string;
}) {
  const {
    data,
    error,
    loading,
    activeCharacterId,
    refresh,
    setSearch,
    searchActive,
    activeFilterCount,
    resetFilters,
    flatModeActive,
    activeCrossCharacterData,
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    mergedAssets,
    abyssal,
    mergedTypeNames,
    mergedLocationNames,
    characterBadges,
    assetsByItemId,
    assetNames,
    assetsExport,
    placeNicknames,
    assetItemActions,
    pinStateFor,
    handleTogglePin,
  } = assetsData;
  const {
    pathStationId,
    pathSegments,
    scrollParentRef,
    rowVirtualizer,
    selectMode,
    selectedIds,
    routeOverride,
    setRouteOverride,
    routePreference,
    stationSortField,
    setStationSortField,
    jumpsAwayOf,
    stationLabelFor,
    sortedTree,
    totalValue,
    showTotalValueChip,
    totalValueFiltered,
    resolved,
    flatMatches,
    rows,
    showItemColumns,
    levelHeadingRef,
    searchRef,
    toggleNodeSelection,
    nodeLabel,
    trailFor,
    nodePathFor,
    rootStationIdFor,
    securityForStation,
  } = assetsRows;
  const isPhone = useIsPhone();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openInFittings = useOpenInFittings();
  if (activeCharacterId === null) return null;
  // Breadcrumb: the station, then every node walked through. The last entry is
  // where we are; the ones before it are links back up.
  const crumbs =
    resolved.station === null
      ? []
      : [
          {
            label: placeNicknames[resolved.station.locationId] ?? stationLabelFor(resolved.station),
            // The real name, for a nicknamed station (screen readers and hover).
            title:
              placeNicknames[resolved.station.locationId] !== undefined
                ? stationLabelFor(resolved.station)
                : undefined,
            href: assetHref(pathStationId, [], query),
          },
          ...resolved.trail.map((node, index) => ({
            label: nodeLabel(node),
            title: undefined,
            href: assetHref(
              pathStationId,
              resolved.trail.slice(0, index + 1).map(assetNodeSegment),
              query
            ),
          })),
        ];
  // The station's own heading is the one place a Place Nickname is renamed. An
  // orphan group (a parent that never resolved) is no place, so it has none.
  const stationHeading =
    resolved.station !== null &&
    resolved.trail.length === 0 &&
    !isUnresolvedParent(resolved.station, mergedLocationNames)
      ? { locationId: resolved.station.locationId, name: stationLabelFor(resolved.station) }
      : null;
  const headingClassName =
    'min-w-0 truncate text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const parentHref =
    crumbs.length > 1 ? crumbs[crumbs.length - 2].href : assetHref(null, [], query);
  // A leaf item carries no aggregate of its own — there is nothing below it to
  // total — so the header simply drops the counts at that depth.
  const deepest = resolved.trail[resolved.trail.length - 1] ?? resolved.station;
  const currentTotals =
    deepest && (!('kind' in deepest) || deepest.kind !== 'item') ? deepest : null;
  const itemsSuffix = currentTotals && (
    <span className="sr-only">
      {t('assets.levelHeading.itemsSuffix', {
        items: t('assets.itemCount', { count: currentTotals.itemCount }),
      })}
    </span>
  );

  // How the abyssal modules in view are valued: every asset at the root, the
  // level's contents when drilled in, the matches in a flat list.
  const abyssalSummary: AbyssalSummary | null = (() => {
    const isAbyssalType = abyssal.isAbyssalType;
    if (!isAbyssalType) return null;
    let scope: readonly Pick<CharacterAsset, 'item_id' | 'type_id'>[];
    if (flatModeActive) scope = flatMatches.map((match) => match.asset);
    else if (pathStationId === null) scope = mergedAssets;
    else if (!deepest) scope = [];
    else {
      const ids = 'kind' in deepest ? collectItemIds(deepest) : collectStationItemIds(deepest);
      scope = ids.flatMap((id) => assetsByItemId.get(id) ?? []);
    }
    return summarizeAbyssal(
      abyssalItemRefs(scope, isAbyssalType).map((item) => item.itemId),
      abyssal.values,
      abyssal.estimates
    );
  })();

  // Phone station header (#2989): security · ISK · jumps on a second line, so the
  // top line is the back button and the full-width station name. An absent item
  // (unknown security, jumps still loading) drops out with its dot.
  const phoneFacts = (() => {
    if (!isPhone || pathStationId === null || !resolved.station) return null;
    const { station } = resolved;
    const resolvedStation = !isUnresolvedParent(station, mergedLocationNames);
    const facts: { key: string; node: ReactNode }[] = [];
    const security = resolvedStation ? securityForStation(station.locationId) : null;
    if (security !== null && security !== undefined) {
      facts.push({ key: 'security', node: <SecurityValue security={security} /> });
    }
    if (currentTotals) {
      facts.push({
        key: 'isk',
        node: (
          <span className="text-isk-pos">
            <IskAmount value={currentTotals.estimatedValue} decimals={0} />
          </span>
        ),
      });
    }
    const jumps = resolvedStation ? jumpsAwayOf(station.locationId) : undefined;
    if (jumps) {
      facts.push({
        key: 'jumps',
        node: (
          <JumpsAwayText
            result={jumps}
            t={t}
            locationId={station.locationId}
            preference={routeOverride}
            linkClassName="inline-flex min-h-9 items-center"
          />
        ),
      });
    }
    return facts.length > 0 ? facts : null;
  })();

  return loading && !data ? (
    <Spinner block="page" label={t('common.loading')} />
  ) : assetsNeedsReauth && !assetsResult ? (
    // A lapsed grant with nothing saved: the full banner. With a saved
    // copy the items stay and a small note sits above them.
    <GrantBanner
      characterId={activeCharacterId}
      endpoints={['getCharacterAssets']}
      title={t('assets.reauthTitle')}
      hint={t('assets.reauthHint')}
      actionLabel={t('assets.reauthAction')}
    />
  ) : error ? (
    <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
  ) : !assetsResult ? (
    <EmptyState title={t('assets.emptyTitle')} hint={t('assets.emptyHint')} />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {assetsNeedsReauth && (
        <ReauthCachedNote characterId={activeCharacterId} endpoints={['getCharacterAssets']} />
      )}
      {assetsResult.fromCache && <CachedNotice fetchedAt={assetsResult.fetchedAt} />}
      {assetsTruncated && (
        <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-warning uppercase">
          <span>
            {t('common.incompleteTitle')} —{' '}
            {t('assets.fetchTruncatedNotice', { shown: assetsResult.data.length })}
          </span>
          <Button size="sm" disabled={loading} onClick={refresh}>
            {t('assets.fetchTruncatedRetry')}
          </Button>
        </p>
      )}

      <AssetItemActionsContext.Provider value={assetItemActions}>
        <Panel padded={false} fill className="flex min-h-0 flex-1 flex-col">
          {/* --- level header: breadcrumb when drilled in, sort controls at the root --- */}
          {flatModeActive ? (
            <div className="flex h-9 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3">
              <span className={eyebrowClassName}>
                {t('assets.search.resultCount', { count: flatMatches.length })}
              </span>
              {/* CSV export always stays scoped to the active Character's own
                      assets (see buildCsvGroups above) — this is the only UI surface
                      that explains why (issue #415), shown exactly when cross-
                      character results are actually on screen to be confused by. */}
              {activeCrossCharacterData && (
                <span className="text-[0.6875rem] text-text-dim">
                  {t('assets.crossCharacterCsvNote')}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {searchActive && (
                  <IconButton
                    icon={<Icon.Close />}
                    label={t('assets.search.clear')}
                    variant="plain"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      searchRef.current?.focus();
                    }}
                  />
                )}
              </div>
            </div>
          ) : pathStationId !== null ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel-2 py-1.5 pr-3 pl-1">
              <IconButton
                icon={<Icon.Back size={Icon.ICON_SIZE.lg} />}
                label={t('assets.breadcrumb.back')}
                variant="plain"
                onClick={() => void navigate(parentHref)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {stationHeading ? (
                  <StationHeading
                    key={stationHeading.locationId}
                    locationId={stationHeading.locationId}
                    name={stationHeading.name}
                    nickname={placeNicknames[stationHeading.locationId]}
                    headingRef={levelHeadingRef}
                    headingClassName={headingClassName}
                  >
                    {itemsSuffix}
                  </StationHeading>
                ) : (
                  <h2 ref={levelHeadingRef} tabIndex={-1} className={headingClassName}>
                    {crumbs.length > 0 ? crumbs[crumbs.length - 1].label : ''}
                    {itemsSuffix}
                  </h2>
                )}
                {phoneFacts && (
                  <span className="flex flex-wrap items-center gap-x-1 text-[0.6875rem] text-text-dim tabular-nums">
                    {phoneFacts.map((fact, index) => (
                      <span key={fact.key} className="flex items-center gap-1">
                        {index > 0 && <span aria-hidden="true">·</span>}
                        {fact.node}
                      </span>
                    ))}
                  </span>
                )}
                {crumbs.length > 1 && (
                  <span className="flex min-w-0 items-center gap-1 truncate text-[0.6875rem] text-text-dim">
                    {crumbs.slice(0, -1).map((crumb, index) => (
                      <span key={crumb.href} className="flex min-w-0 items-center gap-1">
                        {index > 0 && <span aria-hidden="true">›</span>}
                        <Link
                          to={crumb.href}
                          title={crumb.title}
                          aria-label={crumb.title ? `${crumb.label} (${crumb.title})` : undefined}
                          className="truncate hover:text-accent"
                        >
                          {crumb.label}
                        </Link>
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {!phoneFacts &&
                resolved.station &&
                !isUnresolvedParent(resolved.station, mergedLocationNames) && (
                  <span className="hidden shrink-0 items-center gap-2 text-[0.6875rem] text-text-dim sm:flex">
                    <SecurityValue security={securityForStation(resolved.station.locationId)} />
                    <JumpsAwayText
                      result={jumpsAwayOf(resolved.station.locationId)}
                      t={t}
                      locationId={resolved.station.locationId}
                      preference={routeOverride}
                    />
                  </span>
                )}
              {currentTotals && !phoneFacts && (
                <span className="shrink-0 text-[0.6875rem] text-text-dim tabular-nums">
                  <span className="hidden sm:inline">
                    {t('assets.itemCount', { count: currentTotals.itemCount })} ·{' '}
                  </span>
                  <span className="text-sm font-semibold text-isk-pos">
                    <IskAmount value={currentTotals.estimatedValue} decimals={0} />
                  </span>
                </span>
              )}
              {deepest && 'kind' in deepest && deepest.kind === 'ship' && (
                <Button
                  size="md"
                  className="shrink-0"
                  loading={openInFittings.pending}
                  onClick={() =>
                    openInFittings.open(() => assetShipEditLocation(deepest, nodeLabel(deepest)))
                  }
                >
                  {t('assets.openInFittings')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5">
                <h2
                  ref={levelHeadingRef}
                  tabIndex={-1}
                  className={cx(
                    eyebrowClassName,
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                  )}
                >
                  {t('assets.section.locationCount', { count: sortedTree.length })}
                  {showTotalValueChip && ' · '}
                  {showTotalValueChip && (
                    <span
                      data-testid="assets-total-value"
                      className="text-sm font-semibold tracking-normal text-isk-pos normal-case tabular-nums"
                    >
                      {totalValueFiltered
                        ? t('assets.section.totalValueFiltered', {
                            value: formatIsk(totalValue),
                          })
                        : t('assets.section.totalValue', { value: formatIsk(totalValue) })}
                    </span>
                  )}
                </h2>
                {/* Route only matters to the Jumps away sort, so it shows only
                        then, left of Sort. flex-wrap: on a narrow phone the two wrap
                        in DOM order, so focus order matches what's on screen. */}
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  {stationSortField === 'jumpsAway' && (
                    <Select
                      value={routePreference}
                      onValueChange={(value) => setRouteOverride(value as RoutePreferenceKind)}
                    >
                      <SelectTrigger
                        aria-label={t('assets.jumpsAway.routePreference.label')}
                        className="w-40"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUTE_PREFERENCES.map((preference) => (
                          <SelectItem key={preference} value={preference}>
                            {t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select
                    value={stationSortField}
                    onValueChange={(value) => void setStationSortField(value as StationSortField)}
                  >
                    <SelectTrigger aria-label={t('assets.stationSort.label')} className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{t('assets.stationSort.name')}</SelectItem>
                      <SelectItem value="value">{t('assets.stationSort.value')}</SelectItem>
                      <SelectItem value="itemCount">{t('assets.stationSort.itemCount')}</SelectItem>
                      <SelectItem value="jumpsAway">{t('assets.stationSort.jumpsAway')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Without the grant every row degrades to "-"; the note
                      says why (issue #1590). */}
              <GrantNote
                className="shrink-0 border-b border-line px-3"
                characterId={activeCharacterId}
                endpoints={LOCATION_ENDPOINTS}
                title={t('assets.jumpsAway.locationNotGrantedTitle')}
                hint={t('assets.jumpsAway.locationNotGrantedHint')}
                actionLabel={t('assets.jumpsAway.locationNotGrantedAction')}
              />
            </>
          )}

          {abyssalSummary && (
            <AbyssalValueNote
              summary={abyssalSummary}
              className="shrink-0 border-b border-line px-3 py-1.5"
            />
          )}

          {/* --- the list --- */}
          {resolved.unresolved.length > 0 ? (
            <EmptyState
              title={t('assets.staleLink.title')}
              hint={t('assets.staleLink.hint')}
              className="py-8"
              action={
                <Button size="sm" onClick={() => void navigate(assetHref(null, [], query))}>
                  {t('assets.staleLink.action')}
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={flatModeActive ? t('assets.noResults') : t('assets.emptyLocation')}
              className="py-8"
              action={
                activeFilterCount > 0 ? (
                  <Button size="sm" onClick={resetFilters}>
                    {t('common.resetFilters')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div
              ref={scrollParentRef}
              data-virtual-scroll-root
              role="region"
              aria-label={t('assets.treeLabel')}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {showItemColumns && <ItemColumnLabels t={t} />}
              <div
                role="presentation"
                style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
              >
                <TableExportProvider tableExport={assetsExport}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <BrowseRowView
                          row={row}
                          t={t}
                          typeNames={mergedTypeNames}
                          assetNames={assetNames}
                          characterBadges={characterBadges}
                          selectMode={selectMode}
                          selectedIds={selectedIds}
                          onToggleSelection={toggleNodeSelection}
                          stationLabelFor={stationLabelFor}
                          placeNicknames={placeNicknames}
                          nodeLabel={nodeLabel}
                          locationNames={mergedLocationNames}
                          securityForStation={securityForStation}
                          jumpsAwayFor={jumpsAwayOf}
                          pinStateFor={pinStateFor}
                          onTogglePin={(locationId) => void handleTogglePin(locationId)}
                          pathStationId={pathStationId}
                          pathSegments={pathSegments}
                          trailFor={trailFor}
                          nodePathFor={nodePathFor}
                          rootStationIdFor={rootStationIdFor}
                          query={query}
                        />
                      </div>
                    );
                  })}
                </TableExportProvider>
              </div>
            </div>
          )}
        </Panel>
      </AssetItemActionsContext.Provider>
    </div>
  );
}
