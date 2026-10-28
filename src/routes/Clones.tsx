import { NO_NAMES } from '@/lib/emptyCollections';
import { useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  CachedEmptyState,
  EmptyState,
  IconButton,
  Panel,
  SegmentedControl,
  Spinner,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { type ImplantDetail } from '@/features/character/clones';
import { cloneOwnName, saveCloneNickname } from '@/features/character/cloneNicknames';
import { getLastKnownSpSummary } from '@/stores/characterSp';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { sumImplantValue } from '@/engine/implantValue';
import { JumpsAwayText } from '@/features/assets/assetBrowserRows';
import { useCloneJumpsAway } from '@/features/character/useCloneJumpsAway';
import { useImplantPrices } from '@/features/character/useImplantPrices';
import { ClonesSummaryCards } from '@/features/character/ClonesSummaryCards';
import type { JumpClone } from '@/esi/endpoints';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useTimeZone } from '@/lib/timeFormat';
import { useClonesView } from '@/features/character/useClonesView';
import { cloneJumpCooldown } from '@/engine/clone/cloneJump';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { clonesCsvColumns } from '@/features/character/clonesCsv';
import { CloneVerdictCard } from '@/features/character/CloneVerdictCard';
import { WORN_CLONE_ID } from '@/features/character/cloneTraining';
import { CLONES_SORTS, type ClonesSort } from '@/features/character/clonesSort';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { loadClonesSnapshot } from '@/features/character/clonesSnapshot';
import { CloneCard, TOUCH_LINK } from '@/features/character/CloneCard';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_DETAILS: ReadonlyMap<number, ImplantDetail> = new Map();
const NO_CLONES: readonly JumpClone[] = [];
const NO_SYSTEMS: ReadonlyMap<number, number | null> = new Map();
const NO_SECURITIES: ReadonlyMap<number, number> = new Map();
const NO_IDS: readonly number[] = [];

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
  // The full banner is for a lapsed grant with nothing saved to show; with a
  // saved copy the clones stay and a small note sits above them.
  const clonesBlocked = clonesNeedsReauth && clonesResult === null;
  const infomorphLevel = data?.infomorphLevel ?? 0;
  const implantNames = data?.implantNames ?? NO_NAMES;
  const implantDetails = data?.implantDetails ?? NO_DETAILS;
  const locationNames = data?.locationNames ?? NO_NAMES;
  const implantsNeedsReauth = data?.implantsNeedsReauth ?? false;
  const characterSystemId = data?.characterSystemId ?? null;
  const systemIds = data?.systemIds ?? NO_SYSTEMS;
  const securities = data?.securities ?? NO_SECURITIES;
  const characterSystemName = data?.characterSystemName ?? null;
  const wornIds = data?.wornImplants?.data ?? NO_IDS;
  // Falls back to the last SP another tab already loaded for this character,
  // not straight to "—": this tab's own read is still in flight the instant
  // it mounts, and the shared header must not blank out a number the user
  // just saw on Overview or Employment History a moment ago.
  const sp = data?.sp ?? getLastKnownSpSummary(activeCharacterId);
  const loadedAt = data?.loadedAt ?? 0;

  const clones = useMemo(() => clonesResult?.data.jump_clones ?? NO_CLONES, [clonesResult]);
  // An Overview row's `?highlight=<jump_clone_id>`: the worn clone has no id, so its row stays plain.
  const highlightedCloneId = useHighlightParam();
  const cloneListRef = useRef<HTMLUListElement>(null);
  useScrollToRowKey(cloneListRef, highlightedCloneId, clones);
  const lastCloneJumpDate = clonesResult?.data.last_clone_jump_date ?? null;
  const homeLocation = clonesResult?.data.home_location;
  const lastStationChangeDate = clonesResult?.data.last_station_change_date ?? null;

  const cooldown = useMemo(
    () => cloneJumpCooldown(lastCloneJumpDate, infomorphLevel, new Date(loadedAt)),
    [lastCloneJumpDate, infomorphLevel, loadedAt]
  );

  const jumpsByLocation = useCloneJumpsAway(systemIds, characterSystemId, loadedAt);

  const priceIds = useMemo(
    () => [...clones.flatMap((c) => c.implants), ...wornIds],
    [clones, wornIds]
  );
  const prices = useImplantPrices(priceIds);
  const wornValue = prices ? sumImplantValue(wornIds, prices) : null;

  const homeJumps =
    homeLocation?.location_id === undefined
      ? undefined
      : jumpsByLocation?.get(homeLocation.location_id);

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

  const securityOf = (locationId: number | undefined) => {
    const systemId = locationId === undefined ? null : (systemIds.get(locationId) ?? null);
    return systemId === null ? undefined : securities.get(systemId);
  };
  const homeSecurity = securityOf(homeLocation?.location_id);
  const hasWorn = data?.wornImplants != null;
  // The summary cards need loaded clones data; every other state lives in the list panel.
  const showSummary = !(loading && !data) && !clonesBlocked && !error && clonesResult !== null;

  const {
    sort,
    setSort,
    nicknames,
    nicknamesHydrated,
    training,
    verdictCard,
    showTraining,
    rowOf,
    sortedClones,
    bestCloneId,
    locationLabel,
  } = useClonesView({
    data,
    activeCharacterId,
    loadedAt,
    cooldown,
    clones,
    locationNames,
    jumpsByLocation,
    prices,
  });
  const csvColumns = useMemo(
    () => clonesCsvColumns(t, { locationNames, implantNames, nicknames }),
    [t, locationNames, implantNames, nicknames]
  );
  const clonesExport = useTableExport({
    surface: 'clones',
    // Nothing behind the full re-login banner, same as the list.
    rows: clonesBlocked ? NO_CLONES : clones,
    columns: csvColumns,
  });

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

      {showSummary && (
        <div className="flex flex-col gap-4">
          <ClonesSummaryCards
            cooldown={cooldown}
            lastCloneJumpDate={lastCloneJumpDate}
            infomorphLevel={infomorphLevel}
            loadedAt={loadedAt}
            timeZone={timeZone}
            characterSystemId={characterSystemId}
            characterSystemName={characterSystemName}
            securities={securities}
            hasWorn={hasWorn}
            wornIds={wornIds}
            wornValue={wornValue}
            homeLocationId={homeLocation?.location_id}
            homeLocationName={homeLocationName}
            homeSecurity={homeSecurity}
            homeJumps={homeJumps}
            lastStationChangeDate={lastStationChangeDate}
          />
          {/* One DOM: below md the answer leads, from md up the order is as before. */}
          {verdictCard && (
            <div className="order-first md:order-none">
              <CloneVerdictCard
                state={verdictCard}
                names={training?.skillNames ?? NO_NAMES}
                timeZone={timeZone}
              />
            </div>
          )}
        </div>
      )}

      {/*
        The summary cards above the list carry no title or toolbar of their
        own. Data age, Refresh and Export ride on the clone list's toolbar
        below, and that one panel wraps every branch so the toolbar — the only
        way back from a failed or empty load — is there in all of them.
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
              busy={loading}
            />
            <TableActionsMenu name={t('clones.title')} tableExport={clonesExport} />
          </span>
        }
        padded={false}
      >
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : clonesBlocked ? (
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
            {clonesNeedsReauth && (
              <ReauthCachedNote
                className="border-b border-line p-3"
                characterId={activeCharacterId}
                endpoints={['getCharacterClones']}
              />
            )}
            {implantsNeedsReauth && (
              <div className="border-b border-line p-3">
                <GrantBanner
                  characterId={activeCharacterId}
                  endpoints={['getCharacterImplants']}
                  title={t('clones.implantsReauthTitle')}
                  hint={t('clones.implantsReauthHint')}
                  actionLabel={t('clones.reauthAction')}
                />
              </div>
            )}
            {clonesResult.fromCache && (
              <CachedNotice className="px-3 pt-2" fetchedAt={clonesResult.fetchedAt} />
            )}
            {clones.length > 1 && (
              <div className="overflow-x-auto border-b border-line px-3 py-2">
                <SegmentedControl<ClonesSort>
                  label={t('clones.sort.label')}
                  value={sort}
                  onChange={(next) => void setSort(next)}
                  options={CLONES_SORTS.map((value) => ({
                    value,
                    label: t(`clones.sort.${value}`),
                    // Only a note card means "no verdict"; null is still loading.
                    ...(value === 'training' && verdictCard?.kind === 'note'
                      ? { disabled: true, disabledReason: verdictCard.message }
                      : {}),
                  }))}
                />
              </div>
            )}
            {nicknamesHydrated &&
              clones.length > 0 &&
              clones.every((c) => cloneOwnName(c, nicknames) === undefined) && (
                <p className="px-3 pt-3 text-xs text-text-dim">{t('clones.namesNote')}</p>
              )}
            {(clones.length > 0 || hasWorn) && (
              <ul
                ref={cloneListRef}
                aria-label={t('clones.title')}
                className="grid gap-3 p-3 md:grid-cols-2"
              >
                {hasWorn && (
                  <CloneCard
                    current
                    title={t('clones.wearingNow')}
                    place={characterSystemName ?? t('clones.unknownPlace')}
                    security={
                      characterSystemId === null ? undefined : securities.get(characterSystemId)
                    }
                    jumps={null}
                    implantIds={wornIds}
                    implantNames={implantNames}
                    implantDetails={implantDetails}
                    prices={prices}
                    training={
                      showTraining
                        ? { row: rowOf(WORN_CLONE_ID), best: bestCloneId === WORN_CLONE_ID }
                        : undefined
                    }
                  />
                )}
                {sortedClones.map((clone) => {
                  const name = cloneOwnName(clone, nicknames);
                  const place = locationLabel(clone);
                  return (
                    <CloneCard
                      key={clone.jump_clone_id}
                      rowKey={String(clone.jump_clone_id)}
                      highlighted={clone.jump_clone_id === highlightedCloneId}
                      title={name ?? place}
                      place={name === undefined ? null : place}
                      rename={
                        nicknamesHydrated
                          ? {
                              label:
                                name === undefined
                                  ? t('clones.renamePlace', { place })
                                  : t('clones.renameNamed', { name }),
                              value: nicknames[clone.jump_clone_id] ?? '',
                              // What an empty field falls back to: ESI's name, else the place.
                              placeholder: cloneOwnName(clone, {}) ?? place,
                              onSave: (next) => void saveCloneNickname(clone.jump_clone_id, next),
                            }
                          : undefined
                      }
                      security={securityOf(clone.location_id)}
                      jumps={
                        <JumpsAwayText
                          result={jumpsByLocation?.get(clone.location_id)}
                          t={t}
                          locationId={clone.location_id}
                          linkClassName={TOUCH_LINK}
                        />
                      }
                      implantIds={clone.implants}
                      implantNames={implantNames}
                      implantDetails={implantDetails}
                      prices={prices}
                      training={
                        showTraining
                          ? {
                              row: rowOf(clone.jump_clone_id),
                              best: bestCloneId === clone.jump_clone_id,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </ul>
            )}
            {clones.length === 0 && (
              <CachedEmptyState
                result={clonesResult}
                title={t('clones.emptyTitle')}
                hint={t('clones.emptyHint')}
                fetchedTitle={t('clones.emptyFetchedTitle')}
              />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
