import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadCharacterAssets } from '@/features/character/assets';
import type { CachedResult } from '@/esi/cache';
import { loadStationName } from '@/features/character/stations';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CharacterAsset } from '@/esi/endpoints';

interface Snapshot {
  requestKey: string;
  assetsResult: CachedResult<CharacterAsset[]> | null;
  /** D4: fewer pages came back than ESI advertised — the list below is partial. */
  assetsTruncated: boolean;
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
}

function locationLabel(
  locationId: number,
  locationType: CharacterAsset['location_type'],
  locationNames: Map<number, string>,
  assetsByItemId: Map<number, CharacterAsset>,
  typeNames: Map<number, string>,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (locationType === 'station')
    return locationNames.get(locationId) ?? t('assets.stationLabel', { id: locationId });
  if (locationType === 'solar_system') return t('assets.inSpaceLabel', { id: locationId });
  if (locationType === 'item') {
    // The parent is another asset (a container or ship) in this same
    // character's asset list; label the group with ITS resolved type name
    // ("Drake", "Freight Container") instead of a raw item id.
    const parent = assetsByItemId.get(locationId);
    if (parent) {
      const parentName = typeNames.get(parent.type_id);
      if (parentName && parentName !== `Type #${parent.type_id}`) return parentName;
    }
    return t('assets.containerLabel');
  }
  return t('assets.structureLabel', { id: locationId });
}

/** Character assets grouped by location, with a name search filter. Read-only, cached for offline. */
export function Assets() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const requestKey = `${activeCharacterId}:${refreshKey}`;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const assetsResult = await loadCharacterAssets(activeCharacterId);
      const assetsTruncated = assetsResult?.truncated ?? false;
      if (cancelled) return;
      const assets = assetsResult?.data ?? [];
      const typeNames = await loadTypeNames([...new Set(assets.map((a) => a.type_id))]);
      if (cancelled) return;

      const stationIds = [
        ...new Set(assets.filter((a) => a.location_type === 'station').map((a) => a.location_id)),
      ];
      const resolvedStations = await Promise.all(stationIds.map((id) => loadStationName(id)));
      if (cancelled) return;
      const locationNames = new Map<number, string>();
      stationIds.forEach((id, i) => {
        const name = resolvedStations[i];
        if (name) locationNames.set(id, name);
      });

      setSnapshot({ requestKey, assetsResult, assetsTruncated, typeNames, locationNames });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from these same deps
  }, [activeCharacterId, refreshKey]);

  const current = snapshot?.requestKey === requestKey ? snapshot : null;
  const loading = current === null;
  const assetsResult = current?.assetsResult ?? null;
  const assetsTruncated = current?.assetsTruncated ?? false;
  const typeNames = current?.typeNames ?? new Map<number, string>();
  const locationNames = current?.locationNames ?? new Map<number, string>();

  const groups = useMemo(() => {
    const items = assetsResult?.data ?? [];
    const query = search.trim().toLowerCase();
    const assetsByItemId = new Map(items.map((asset) => [asset.item_id, asset]));
    const byLocation = new Map<number, { asset: CharacterAsset; name: string }[]>();
    for (const asset of items) {
      const name = typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
      if (query && !name.toLowerCase().includes(query)) continue;
      const list = byLocation.get(asset.location_id) ?? [];
      list.push({ asset, name });
      byLocation.set(asset.location_id, list);
    }
    return [...byLocation.entries()]
      .map(([locationId, entries]) => ({
        locationId,
        label: locationLabel(
          locationId,
          entries[0].asset.location_type,
          locationNames,
          assetsByItemId,
          typeNames,
          t
        ),
        entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable from i18next
  }, [assetsResult, typeNames, locationNames, search]);

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
          <Button size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            {t('assets.refresh')}
          </Button>
        </div>
      </header>

      {!loading && assetsResult && (
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
      ) : !assetsResult ? (
        <EmptyState title={t('assets.emptyTitle')} hint={t('assets.emptyHint')} />
      ) : (
        <>
          {assetsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          {assetsTruncated && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.incompleteTitle')}</p>
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
