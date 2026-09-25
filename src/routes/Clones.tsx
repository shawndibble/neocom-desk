import { Fragment, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  StatChip,
  Tooltip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { loadCharacterClones, loadImplantDescriptions } from '@/features/character/clones';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { loadCharacterSpSummary } from '@/features/character/characterSp';
import { getLastKnownSpSummary, type CharacterSpSummary } from '@/stores/characterSp';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CachedResult } from '@/esi/cache';
import type { CharacterClones, JumpClone } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { cloneJumpCooldown, INFOMORPH_SYNCHRONIZING_SKILL_ID } from '@/engine/cloneJump';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  clonesResult: CachedResult<CharacterClones> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  clonesNeedsReauth: boolean;
  /** Effective level of Infomorph Synchronizing; 0 when unknown/untrained. */
  infomorphLevel: number;
  implantNames: Map<number, string>;
  /** Markup-stripped implant descriptions for the name tooltips; absent ids get no tooltip. */
  implantDescriptions: Map<number, string>;
  /** Jump-clone and home-clone location names, keyed by `location_id`. */
  locationNames: Map<number, string>;
  /** Total/unallocated SP for the shared Character-overview header. */
  sp: CharacterSpSummary;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

async function loadClonesSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [{ cached: clonesResult, needsReauth: clonesNeedsReauth }, corrected, sp] =
    await Promise.all([
      loadCharacterClones(characterId),
      loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }),
      loadCharacterSpSummary(characterId, Date.now()),
    ]);
  const loadedAt = Date.now();
  // Effective (issue #1236: min of queue-corrected trained and active), not
  // raw trained_skill_level — the cooldown should never read shorter than
  // what the character's clone can actually use right now.
  const infomorphLevel = corrected.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];
  const homeLocation = clonesResult?.data.home_location;

  // Already superseded: skip the name resolves, their results would be discarded.
  const implantTypeIds = signal.cancelled ? [] : [...new Set(clones.flatMap((c) => c.implants))];
  const [implantNames, implantDescriptions] = await Promise.all([
    loadTypeNames(implantTypeIds),
    loadImplantDescriptions(implantTypeIds),
  ]);

  // Ids to resolve for one location type: every jump clone of that type, plus
  // the home clone's location if it happens to be that type too.
  function idsForType(type: 'station' | 'structure'): number[] {
    if (signal.cancelled) return [];
    return [
      ...new Set([
        ...clones.filter((c) => c.location_type === type).map((c) => c.location_id),
        ...(homeLocation?.location_type === type && homeLocation.location_id !== undefined
          ? [homeLocation.location_id]
          : []),
      ]),
    ];
  }
  const stationIds = idsForType('station');
  const structureIds = idsForType('structure');
  const [resolvedStations, resolvedStructures] = await Promise.all([
    // Every id here is an NPC station by `location_type`, and those come out
    // of the SDE snapshot rather than ESI (issue #655) — a map lookup per id,
    // so there is nothing worth capping. Only an unreadable snapshot puts a
    // request back behind each id; see `loadAssetsSnapshot` for the same note.
    Promise.all(stationIds.map((id) => loadStationName(id))),
    // A 403 here means the structure is outside this character's ACL, not a
    // revoked scope — loadStructureName already narrows that so it never
    // signals a re-auth failure; the clone just renders with an id fallback.
    Promise.all(structureIds.map((id) => loadStructureName(characterId, id))),
  ]);
  const locationNames = new Map<number, string>();
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });
  structureIds.forEach((id, i) => {
    const name = resolvedStructures[i];
    if (name) locationNames.set(id, name);
  });

  return {
    clonesResult,
    clonesNeedsReauth,
    infomorphLevel,
    implantNames,
    implantDescriptions,
    locationNames,
    sp,
    loadedAt,
  };
}

/** An implant name linking to Market, with its description in a hover/focus tooltip when it has one. */
function ImplantLink({
  typeId,
  name,
  description,
}: {
  typeId: number;
  name: string;
  description?: string;
}) {
  const link = <MarketItemLink typeId={typeId}>{name}</MarketItemLink>;
  return description ? <Tooltip content={description}>{link}</Tooltip> : link;
}

/** Clones: jump clones, their locations and implants, plus the current jump cooldown. */
export function Clones() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadClonesSnapshot,
    undefined,
    { cacheKey: 'clones' }
  );

  const clonesResult = data?.clonesResult ?? null;
  const clonesNeedsReauth = data?.clonesNeedsReauth ?? false;
  const infomorphLevel = data?.infomorphLevel ?? 0;
  const implantNames = data?.implantNames ?? NO_NAMES;
  const implantDescriptions = data?.implantDescriptions ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;
  // Falls back to the last SP another tab already loaded for this character,
  // not straight to "—": this tab's own read is still in flight the instant
  // it mounts, and the shared header must not blank out a number the user
  // just saw on Overview or Employment History a moment ago.
  const sp = data?.sp ?? getLastKnownSpSummary(activeCharacterId);
  const loadedAt = data?.loadedAt ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];
  const lastCloneJumpDate = clonesResult?.data.last_clone_jump_date ?? null;
  const homeLocation = clonesResult?.data.home_location;
  const lastStationChangeDate = clonesResult?.data.last_station_change_date ?? null;

  const cooldown = useMemo(
    () => cloneJumpCooldown(lastCloneJumpDate, infomorphLevel, new Date(loadedAt)),
    [lastCloneJumpDate, infomorphLevel, loadedAt]
  );

  const cooldownTone: StatChipTone = cooldown.onCooldown ? 'warning' : 'success';

  const homeLocationName =
    homeLocation?.location_id === undefined
      ? null
      : (locationNames.get(homeLocation.location_id) ??
        t(
          homeLocation.location_type === 'structure'
            ? 'clones.structureLabel'
            : 'clones.stationLabel',
          { id: homeLocation.location_id }
        ));

  const columns = useMemo<DataTableColumn<JumpClone>[]>(
    () => [
      {
        id: 'location',
        header: t('clones.location'),
        sortValue: (clone) =>
          locationNames.get(clone.location_id) ??
          t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
            id: clone.location_id,
          }),
        render: (clone) =>
          locationNames.get(clone.location_id) ??
          t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
            id: clone.location_id,
          }),
      },
      {
        id: 'implants',
        header: t('clones.implants'),
        sortValue: (clone) => clone.implants.length,
        render: (clone) =>
          clone.implants.length === 0
            ? t('clones.noImplants')
            : clone.implants.map((id, index) => (
                <Fragment key={id}>
                  {index > 0 && ', '}
                  <ImplantLink
                    typeId={id}
                    name={implantNames.get(id) ?? `Type #${id}`}
                    description={implantDescriptions.get(id)}
                  />
                </Fragment>
              )),
      },
    ],
    [t, locationNames, implantNames, implantDescriptions]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={activeCharacterId}
        totalSp={sp.totalSp}
        unallocatedSp={sp.unallocatedSp}
      />
      <OverviewSubNav />

      {/*
        Data age and Refresh ride on the panel's own toolbar rather than up
        beside the character's name: they describe *this* tab's data, and above
        the tabs is the block every tab shares. One panel wraps every branch so
        that toolbar — the only way back from a failed or empty load — is there
        in all of them, not just when there are rows to show.
      */}
      <Panel
        title={t('clones.title')}
        actions={
          <span className="flex items-center gap-2">
            {clonesResult && <DataAgeBadge date={clonesResult.fetchedAt} />}
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('clones.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </span>
        }
        padded={false}
      >
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : clonesNeedsReauth ? (
          <div className="p-3">
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCharacterClones']}
              title={t('clones.reauthTitle')}
              hint={t('clones.reauthHint')}
              actionLabel={t('clones.reauthAction')}
            />
          </div>
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : !clonesResult ? (
          <EmptyState title={t('clones.emptyTitle')} hint={t('clones.emptyHint')} />
        ) : (
          <>
            {/* Home clone and cooldown were their own Panel; panels don't nest,
                so this becomes this one's first row, hairline-separated from
                whatever follows. It renders whenever clones data loaded at
                all, not only when there are jump clones — a character with a
                home clone and zero jump clones still has both to show. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2 text-sm">
              {homeLocationName && (
                <span>
                  <span className="text-text-dim">{t('clones.homeLocation')}: </span>
                  {homeLocationName}
                </span>
              )}
              {lastStationChangeDate && (
                <span className="text-text-dim">
                  {t('clones.lastStationChange', {
                    date: formatTimestamp(new Date(lastStationChangeDate), timeZone),
                  })}
                </span>
              )}
              <StatChip
                label={t('clones.cooldown')}
                tone={cooldownTone}
                value={
                  cooldown.onCooldown && cooldown.readyAt
                    ? t('clones.cooldownOnCooldownValue', {
                        date: formatTimestamp(cooldown.readyAt, timeZone),
                        duration: formatDuration((cooldown.readyAt.getTime() - loadedAt) / 1000),
                      })
                    : t('clones.cooldownReadyValue')
                }
              />
            </div>
            {clonesResult.fromCache && (
              <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                {t('common.offlineTitle')}
              </p>
            )}
            {clones.length === 0 ? (
              <EmptyState title={t('clones.emptyTitle')} hint={t('clones.emptyHint')} />
            ) : (
              <DataTable
                label={t('clones.title')}
                columns={columns}
                rows={clones}
                rowKey={(clone) => clone.jump_clone_id}
                mobileSort
              />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
