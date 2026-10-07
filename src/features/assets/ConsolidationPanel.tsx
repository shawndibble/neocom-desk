import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import { planConsolidation } from '@/engine/assets/consolidation';
import { loadAllCharactersAssets, type FannedOutAssets } from '@/features/character/assets';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadTypeNames, loadTypePackagedVolumes } from '@/features/character/typeNames';
import { totalCargoM3, useHaulingCargo } from '@/features/market/haulingCargo';
import { routeToHref } from '@/features/travel/routeSafetyLink';
import { formatCubicMetres } from '@/lib/volume';

interface Loaded {
  fanned: FannedOutAssets;
  stationNames: Map<number, string>;
  typeNames: Map<number, string>;
  unitM3: Map<number, number>;
}

async function load(): Promise<Loaded> {
  const fanned = await loadAllCharactersAssets();
  const all = fanned.entries.flatMap((e) => e.assets);
  const stationIds = [
    ...new Set(all.filter((a) => a.location_type === 'station').map((a) => a.location_id)),
  ];
  const [names, typeNames, unitM3] = await Promise.all([
    Promise.all(stationIds.map((id) => loadStationName(id))),
    loadTypeNames(all.map((a) => a.type_id)),
    loadTypePackagedVolumes(all.map((a) => a.type_id)),
  ]);
  const stationNames = new Map<number, string>();
  stationIds.forEach((id, i) => stationNames.set(id, names[i] ?? String(id)));
  return { fanned, stationNames, typeNames, unitM3 };
}

/**
 * Consolidation Plan: pick a station and see, per Character, the loose stock
 * elsewhere that would have to move there, with its packaged volume. A
 * Cargo-Space-based estimate — it states volumes and trips, not a safety
 * verdict; the route link opens Route Safety for that.
 */
export function ConsolidationPanel() {
  const { t } = useTranslation();
  const cargo = useHaulingCargo((s) => s.value);
  const hydrateCargo = useHaulingCargo((s) => s.hydrate);
  useEffect(() => {
    void hydrateCargo();
  }, [hydrateCargo]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [destination, setDestination] = useState<number | null>(null);
  const [systemOf, setSystemOf] = useState<{ station: number; system: number | null } | null>(null);
  const [fromSystems, setFromSystems] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    let live = true;
    load().then(
      (result) => {
        if (live) setLoaded(result);
      },
      () => {
        if (live) setFailed(true);
      }
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let live = true;
    Promise.all(
      loaded.fanned.entries.map(
        async (e) => [e.characterId, await loadCharacterSolarSystemId(e.characterId)] as const
      )
    ).then((pairs) => {
      if (!live) return;
      const next = new Map<number, number>();
      for (const [id, system] of pairs) if (system !== null) next.set(id, system);
      setFromSystems(next);
    });
    return () => {
      live = false;
    };
  }, [loaded]);

  useEffect(() => {
    if (destination === null) return;
    let live = true;
    loadStationSystemId(destination).then((system) => {
      if (live) setSystemOf({ station: destination, system });
    });
    return () => {
      live = false;
    };
  }, [destination]);

  // Keyed by station so a stale lookup for a previously picked one is ignored.
  const destSystem = systemOf?.station === destination ? systemOf.system : null;

  const stations = useMemo(
    () =>
      loaded
        ? [...loaded.stationNames].sort(([, a], [, b]) => a.localeCompare(b))
        : ([] as [number, string][]),
    [loaded]
  );

  const holdsCapacityM3 = useMemo(() => {
    if (!cargo) return null;
    const general = cargo.holds
      .filter((h) => h.kind === 'general')
      .reduce((sum, h) => sum + h.capacityM3, 0);
    return general > 0 ? general : totalCargoM3(cargo);
  }, [cargo]);

  const plan = useMemo(() => {
    if (!loaded || destination === null) return null;
    return planConsolidation({
      destinationLocationId: destination,
      characters: loaded.fanned.entries.map((e) => ({
        characterId: e.characterId,
        name: e.name,
        assets: e.assets.map((a) => ({
          itemId: a.item_id,
          typeId: a.type_id,
          quantity: a.quantity,
          locationId: a.location_id,
          locationType: a.location_type,
          isSingleton: a.is_singleton ?? false,
        })),
      })),
      unitM3: loaded.unitM3,
      holdsCapacityM3,
    });
  }, [loaded, destination, holdsCapacityM3]);

  const incomplete =
    loaded !== null &&
    (loaded.fanned.skipped.length > 0 || loaded.fanned.entries.some((e) => e.truncated));
  const atLeast = incomplete || (plan?.perCharacter.some((c) => c.unknownTypeCount > 0) ?? false);

  return (
    <Panel title={t('assets.consolidate.title')}>
      {failed ? (
        <p className="text-sm text-text-dim">{t('assets.consolidate.failed')}</p>
      ) : !loaded ? (
        <Spinner size="sm" label={t('assets.consolidate.loading')} />
      ) : loaded.fanned.entries.length < 2 ? (
        <p className="text-sm text-text-dim">{t('assets.consolidate.notEnoughCharacters')}</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('assets.consolidate.pickDestination')}</span>
            <Select
              value={destination === null ? '' : String(destination)}
              onValueChange={(value) => setDestination(Number(value))}
            >
              <SelectTrigger size="sm" aria-label={t('assets.consolidate.pickDestination')}>
                <SelectValue placeholder={t('assets.consolidate.destinationPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {stations.map(([id, name]) => (
                  <SelectItem key={id} value={String(id)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {incomplete && (
            <p className="text-xs text-text-dim">
              {t('assets.consolidate.incomplete', {
                names: [
                  ...loaded.fanned.skipped.map((s) => s.name),
                  ...loaded.fanned.entries.filter((e) => e.truncated).map((e) => e.name),
                ].join(', '),
              })}
            </p>
          )}
          {plan &&
            (plan.perCharacter.length === 0 ? (
              <p className="text-text-dim">{t('assets.consolidate.nothingToMove')}</p>
            ) : (
              <>
                <p className="font-medium">
                  {t(atLeast ? 'assets.consolidate.totalAtLeast' : 'assets.consolidate.total', {
                    volume: `${formatCubicMetres(plan.totalM3)} m³`,
                  })}
                  {' · '}
                  {plan.trips !== null
                    ? t('assets.consolidate.trips', { count: plan.trips })
                    : t('assets.consolidate.noHauler')}
                </p>
                {plan.perCharacter.map((c) => (
                  <section key={c.characterId} className="flex flex-col gap-1">
                    <h3 className="flex flex-wrap items-center gap-2 font-medium">
                      {c.name}
                      <span className="text-text-dim">
                        {t(
                          c.unknownTypeCount > 0
                            ? 'assets.consolidate.totalAtLeast'
                            : 'assets.consolidate.total',
                          { volume: `${formatCubicMetres(c.totalM3)} m³` }
                        )}
                      </span>
                      {destSystem !== null && (
                        <Link
                          className="text-xs text-accent underline"
                          to={routeToHref(destSystem, fromSystems.get(c.characterId) ?? null)}
                        >
                          {t('assets.consolidate.viewRoute')}
                        </Link>
                      )}
                    </h3>
                    <ul className="text-xs text-text-dim">
                      {c.lines.slice(0, 50).map((l) => (
                        <li key={l.typeId}>
                          {l.quantity.toLocaleString()} ×{' '}
                          {loaded.typeNames.get(l.typeId) ?? l.typeId}
                          {l.m3 !== null && ` — ${formatCubicMetres(l.m3)} m³`}
                        </li>
                      ))}
                      {c.lines.length > 50 && (
                        <li>{t('assets.consolidate.more', { count: c.lines.length - 50 })}</li>
                      )}
                    </ul>
                  </section>
                ))}
              </>
            ))}
        </div>
      )}
    </Panel>
  );
}
