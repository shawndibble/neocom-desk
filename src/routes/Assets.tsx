import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, ReauthBanner, Spinner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { loadCharacterAssets } from '@/features/character/assets';
import type { CachedResult } from '@/esi/cache';
import { loadStationName } from '@/features/character/stations';
import { loadTypeNames } from '@/features/character/typeNames';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CharacterAsset } from '@/esi/endpoints';
import { capItems } from '@/lib/cap';
import { downloadCsv } from '@/lib/downloadCsv';
import { assetCsvRows, assetsCsvColumns } from '@/features/character/assetsCsv';

/** Rendered rows past this many and grouping/painting the list starts to lag. */
export const MAX_RENDERED_ASSETS = 1000;

/** Stable identity, so the fallback doesn't invalidate the grouping memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  assetsResult: CachedResult<CharacterAsset[]> | null;
  /** Pages were capped or missing — the list below is partial. */
  assetsTruncated: boolean;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  assetsNeedsReauth: boolean;
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
}

function locationLabel(
  locationId: number,
  locationType: CharacterAsset['location_type'],
  locationNames: ReadonlyMap<number, string>,
  assetsByItemId: Map<number, CharacterAsset>,
  typeNames: ReadonlyMap<number, string>,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (locationType === 'station')
    return locationNames.get(locationId) ?? t('assets.stationLabel', { id: locationId });
  if (locationType === 'solar_system') return t('assets.inSpaceLabel', { id: locationId });
  if (locationType === 'item') {
    // The parent is another asset (container or ship) in this same list; label
    // the group with ITS resolved type name instead of a raw item id.
    const parent = assetsByItemId.get(locationId);
    if (parent) {
      const parentName = typeNames.get(parent.type_id);
      if (parentName && parentName !== `Type #${parent.type_id}`) return parentName;
    }
    return t('assets.containerLabel');
  }
  return t('assets.structureLabel', { id: locationId });
}

async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: assetsResult, needsReauth: assetsNeedsReauth } =
    await loadCharacterAssets(characterId);
  const assetsTruncated = assetsResult?.truncated ?? false;
  const assets = assetsResult?.data ?? [];

  // Already superseded: skip the ESI name resolves, their results would be discarded.
  const typeIds = signal.cancelled ? [] : [...new Set(assets.map((a) => a.type_id))];
  const typeNames = await loadTypeNames(typeIds);

  const stationIds = signal.cancelled
    ? []
    : [...new Set(assets.filter((a) => a.location_type === 'station').map((a) => a.location_id))];
  const resolvedStations = await Promise.all(stationIds.map((id) => loadStationName(id)));
  const locationNames = new Map<number, string>();
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });

  return { assetsResult, assetsTruncated, assetsNeedsReauth, typeNames, locationNames };
}

/** Character assets grouped by location, with a name search filter. Read-only, cached for offline. */
export function Assets() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadAssetsSnapshot);

  const [search, setSearch] = useState('');

  const assetsResult = data?.assetsResult ?? null;
  const assetsTruncated = data?.assetsTruncated ?? false;
  const assetsNeedsReauth = data?.assetsNeedsReauth ?? false;
  const typeNames = data?.typeNames ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;

  const { groups, csvGroups, shownCount, totalMatches } = useMemo(() => {
    const items = assetsResult?.data ?? [];
    const query = search.trim().toLowerCase();
    const assetsByItemId = new Map(items.map((asset) => [asset.item_id, asset]));

    const matches: { asset: CharacterAsset; name: string }[] = [];
    for (const asset of items) {
      const name = typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
      if (query && !name.toLowerCase().includes(query)) continue;
      matches.push({ asset, name });
    }
    const capped = capItems(matches, MAX_RENDERED_ASSETS);

    const groupEntries = (entries: readonly { asset: CharacterAsset; name: string }[]) => {
      const byLocation = new Map<number, { asset: CharacterAsset; name: string }[]>();
      for (const entry of entries) {
        const list = byLocation.get(entry.asset.location_id) ?? [];
        list.push(entry);
        byLocation.set(entry.asset.location_id, list);
      }
      return [...byLocation.entries()]
        .map(([locationId, locationEntries]) => ({
          locationId,
          label: locationLabel(
            locationId,
            locationEntries[0].asset.location_type,
            locationNames,
            assetsByItemId,
            typeNames,
            t
          ),
          entries: locationEntries.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    // Rendering caps at MAX_RENDERED_ASSETS for paint performance; CSV export
    // uses the full matched set (still respecting `search`) — a UI cap must
    // never silently drop rows from the exported file.
    return {
      groups: groupEntries(capped.items),
      csvGroups: groupEntries(matches),
      shownCount: capped.items.length,
      totalMatches: matches.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable from i18next
  }, [assetsResult, typeNames, locationNames, search]);

  const renderTruncated = shownCount < totalMatches;

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('assets.title')}</h1>
        <div className="flex items-center gap-2">
          {assetsResult && <DataAgeBadge date={assetsResult.fetchedAt} />}
          <Button
            size="sm"
            disabled={csvGroups.length === 0}
            onClick={() =>
              downloadCsv(
                'assets',
                assetCsvRows(
                  csvGroups.map((group) => ({
                    label: group.label,
                    entries: group.entries.map((entry) => ({
                      name: entry.name,
                      quantity: entry.asset.quantity,
                    })),
                  }))
                ),
                assetsCsvColumns(t),
                new Date(),
                assetsTruncated
              )
            }
          >
            {t('assets.exportCsv')}
          </Button>
          <Button size="sm" onClick={refresh} disabled={loading}>
            {t('assets.refresh')}
          </Button>
        </div>
      </header>

      {!loading && assetsResult && !assetsNeedsReauth && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('assets.searchPlaceholder')}
          className="h-9 w-full rounded-xs border border-line bg-panel-2 px-3 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : assetsNeedsReauth ? (
        <ReauthBanner
          title={t('assets.reauthTitle')}
          hint={t('assets.reauthHint')}
          actionLabel={t('assets.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !assetsResult ? (
        <EmptyState title={t('assets.emptyTitle')} hint={t('assets.emptyHint')} />
      ) : (
        <>
          {assetsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          {assetsTruncated && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} —{' '}
              {t('assets.fetchTruncatedNotice', { shown: assetsResult.data.length })}
            </p>
          )}
          {renderTruncated && (
            <p className="text-[11px] text-warning uppercase">
              {t('assets.renderTruncatedNotice', { shown: shownCount, total: totalMatches })}
            </p>
          )}
          {groups.length === 0 ? (
            <EmptyState title={t('assets.noResults')} className="py-8" />
          ) : (
            groups.map((group) => (
              <Panel key={group.locationId} title={group.label} padded={false}>
                <ul className="divide-y divide-line">
                  {group.entries.map(({ asset, name }) => (
                    <li
                      key={asset.item_id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                    >
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 tabular-nums text-text-dim">
                        {t('assets.quantity')} {asset.quantity.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))
          )}
        </>
      )}
    </div>
  );
}
