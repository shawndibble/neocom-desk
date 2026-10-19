import { NO_NAMES } from '@/lib/emptyCollections';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useMemo, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
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
  STAT_CHIP_TONE_TEXT_CLASS,
  type StatChipTone,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { type ImplantDetail } from '@/features/character/clones';
import {
  cloneOwnName,
  saveCloneNickname,
  useCloneNicknames,
} from '@/features/character/cloneNicknames';
import { getLastKnownSpSummary } from '@/stores/characterSp';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { SecurityStatus } from '@/components/SecurityStatus';
import { IskAmount, ProgressBar } from '@/components/ui';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import { cooldownProgress, sumImplantValue } from '@/engine/implantValue';
import { JumpsAwayText } from '@/features/character/assetBrowserRows';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { JumpClone } from '@/esi/endpoints';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { cloneJumpCooldown, cloneJumpCooldownHours } from '@/engine/clone/cloneJump';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { clonesCsvColumns } from '@/features/character/clonesCsv';
import {
  CloneVerdictCard,
  type CloneVerdictCardState,
} from '@/features/character/CloneVerdictCard';
import { WORN_CLONE_ID } from '@/features/character/cloneTraining';
import {
  CLONES_SORTS,
  sortClones,
  useClonesSort,
  type ClonesSort,
} from '@/features/character/clonesSort';
import {
  CLONE_NOTE_KEY,
  cloneVerdictGate,
  runCloneVerdict,
} from '@/features/character/cloneVerdictGate';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { loadClonesSnapshot } from '@/features/character/clonesSnapshot';
import { CloneCard, TOUCH_LINK, type PriceMap } from '@/features/character/CloneCard';

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
  const lastCloneJumpDate = clonesResult?.data.last_clone_jump_date ?? null;
  const homeLocation = clonesResult?.data.home_location;
  const lastStationChangeDate = clonesResult?.data.last_station_change_date ?? null;

  const cooldown = useMemo(
    () => cloneJumpCooldown(lastCloneJumpDate, infomorphLevel, new Date(loadedAt)),
    [lastCloneJumpDate, infomorphLevel, loadedAt]
  );

  // Jumps away from where the Character is now, on the saved route preference
  // (the Travel route rule). Filled in after the first paint: a progressive
  // enhancement, so a slow graph never holds the clones back.
  const basis = useJumpBasis();
  const [jumpsAway, setJumpsAway] = useState<{
    key: string;
    byLocation: ReadonlyMap<number, JumpsAwayResult>;
  } | null>(null);
  const jumpsKey = `${basis.key}:${characterSystemId}:${loadedAt}`;
  useEffect(() => {
    if (!basis.hydrated || loadedAt === 0) return;
    let cancelled = false;
    void Promise.all(
      [...systemIds].map(async ([locationId, systemId]): Promise<[number, JumpsAwayResult]> => {
        if (characterSystemId === null) {
          return [locationId, { kind: 'unknown', reason: 'noLocation' }];
        }
        if (systemId === null) return [locationId, { kind: 'unknown', reason: 'noRoute' }];
        return [locationId, await jumpsBetween(characterSystemId, systemId, basis)];
      })
    ).then((entries) => {
      if (!cancelled) setJumpsAway({ key: jumpsKey, byLocation: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [basis, characterSystemId, systemIds, loadedAt, jumpsKey]);
  const jumpsByLocation = jumpsAway?.key === jumpsKey ? jumpsAway.byLocation : undefined;

  // Implant values at the market hub: lowest sell there, else lowest in its
  // region. Another progressive enhancement: the list shows before any price.
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useHydratedStore(useMarketHub);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceIds = useMemo(
    () => [...new Set([...clones.flatMap((c) => c.implants), ...wornIds])].sort((a, b) => a - b),
    [clones, wornIds]
  );
  const priceKey = `${hub.id}:${priceIds.join(',')}`;
  const [priced, setPriced] = useState<{ key: string; prices: PriceMap } | null>(null);
  useEffect(() => {
    if (!hubHydrated || priceIds.length === 0) return;
    let cancelled = false;
    void Promise.all([getHubPrices(hub, priceIds), getRegionSellPrices(hub.regionId, priceIds)])
      .then(([hubAgg, region]) => {
        if (cancelled) return;
        const prices = new Map<number, number | null>();
        for (const id of priceIds)
          prices.set(id, hubAgg.get(id)?.sellMin ?? region.get(id) ?? null);
        setPriced({ key: priceKey, prices });
      })
      .catch(() => {
        // A failed read leaves every implant unpriced rather than an endless wait.
        if (!cancelled) setPriced({ key: priceKey, prices: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated, priceIds, priceKey]);
  const prices = priced?.key === priceKey ? priced.prices : undefined;
  const wornValue = prices ? sumImplantValue(wornIds, prices) : null;

  const cooldownHours = cloneJumpCooldownHours(infomorphLevel);
  const cooldownFraction = cooldownProgress(lastCloneJumpDate, cooldownHours, new Date(loadedAt));

  // Empty (no element at all) when there is no last jump and no reduction to state.
  const cooldownNote = [
    lastCloneJumpDate &&
      t('clones.lastJump', {
        date: formatTimestamp(new Date(lastCloneJumpDate), timeZone),
      }),
    infomorphLevel > 0 && t('clones.infomorphReduction', { hours: Math.min(infomorphLevel, 24) }),
  ]
    .filter(Boolean)
    .join(' · ');
  const cooldownTone: StatChipTone = cooldown.onCooldown ? 'warning' : 'success';

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

  const locationLabel = (clone: JumpClone) =>
    locationNames.get(clone.location_id) ??
    t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
      id: clone.location_id,
    });
  const securityOf = (locationId: number | undefined) => {
    const systemId = locationId === undefined ? null : (systemIds.get(locationId) ?? null);
    return systemId === null ? undefined : securities.get(systemId);
  };
  const homeSecurity = securityOf(homeLocation?.location_id);
  const hasWorn = data?.wornImplants != null;
  // The summary cards need loaded clones data; every other state lives in the list panel.
  const showSummary = !(loading && !data) && !clonesBlocked && !error && clonesResult !== null;

  // Which clone is best for the active queue (the engine does the numbers).
  const sort = useClonesSort((state) => state.value);
  const setSort = useClonesSort((state) => state.setValue);
  useHydratedStore(useClonesSort);
  const nicknames = useCloneNicknames((state) => state.value);
  const nicknamesHydrated = useHydratedStore(useCloneNicknames);
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useHydratedStore(useCloneStates);
  const training = data?.training ?? null;
  const readyAt = cooldown.onCooldown ? cooldown.readyAt : null;
  const verdictResult = useMemo(() => {
    if (!cloneStatesHydrated || activeCharacterId === null) return null;
    return runCloneVerdict(
      training,
      cloneStateFor(cloneStates, activeCharacterId),
      loadedAt,
      readyAt
    );
  }, [training, cloneStates, cloneStatesHydrated, activeCharacterId, loadedAt, readyAt]);
  const cloneLabel = (clone: JumpClone) => cloneOwnName(clone, nicknames) ?? locationLabel(clone);
  const verdictCard: CloneVerdictCardState | null = (() => {
    if (!data) return null;
    const note = (message: string): CloneVerdictCardState => ({ kind: 'note', message });
    const gate = cloneVerdictGate(
      {
        wornImplantsRead: data.wornImplants !== null,
        queue: data.queueResult?.data ?? null,
        training,
      },
      verdictResult
    );
    if (gate === null) return null;
    if (gate.kind === 'note') {
      return note(t(`clones.verdict.note${CLONE_NOTE_KEY[gate.note]}`));
    }
    const { verdict } = gate.result;
    if (verdict.kind === 'stay') {
      const rival = clones.find((c) => c.jump_clone_id === verdict.closest?.cloneId);
      return {
        kind: 'stay',
        stay: verdict.stay,
        cooldownReadyAt: readyAt,
        closest:
          verdict.closest && rival
            ? { label: cloneLabel(rival), extraSeconds: verdict.closest.extraSeconds }
            : null,
      };
    }
    const target = clones.find((c) => c.jump_clone_id === verdict.cloneId);
    if (!target) return null;
    const route = jumpsByLocation?.get(target.location_id);
    if (!route) return note(t('clones.verdict.noteRouting'));
    if (route.kind === 'unknown') return note(t('clones.verdict.noteRoute'));
    return {
      kind: 'jump',
      label: cloneLabel(target),
      savedSeconds: verdict.savedSeconds,
      attributes: verdict.attributes,
      stay: verdict.stay,
      best: verdict.best,
      cooldownReadyAt: verdict.cooldownReadyAt,
      route: {
        locationId: target.location_id,
        placeName: locationLabel(target),
        jumps: route.jumps,
      },
    };
  })();
  const showTraining = verdictCard !== null && verdictCard.kind !== 'note';
  const rowOf = (id: string | number) => verdictResult?.rows.find((r) => r.cloneId === id);
  const sortedClones = sortClones(
    clones.map((clone) => {
      const implantValue = prices ? sumImplantValue(clone.implants, prices) : null;
      return {
        clone,
        id: clone.jump_clone_id,
        locationId: clone.location_id,
        deltaSeconds: showTraining ? (rowOf(clone.jump_clone_id)?.deltaSeconds ?? null) : null,
        value:
          implantValue &&
          (implantValue.unpriced < clone.implants.length || clone.implants.length === 0)
            ? implantValue.total
            : null,
      };
    }),
    sort,
    jumpsByLocation
  ).map((x) => x.clone);
  const bestCloneId = showTraining ? (verdictResult?.bestCloneId ?? null) : null;
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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4 text-sm">
            <Panel className="h-full">
              <section aria-label={t('clones.cooldown')} className="space-y-1">
                <h3 className={eyebrowClassName}>{t('clones.cooldownShared')}</h3>
                {/* The header above names it; the value wraps rather than sitting in a nowrap chip. */}
                <p
                  className={`font-medium tabular-nums ${STAT_CHIP_TONE_TEXT_CLASS[cooldownTone]}`}
                >
                  {cooldown.onCooldown && cooldown.readyAt
                    ? t('clones.cooldownOnCooldownValue', {
                        date: formatTimestamp(cooldown.readyAt, timeZone),
                        duration: formatDuration((cooldown.readyAt.getTime() - loadedAt) / 1000),
                      })
                    : t('clones.cooldownReadyValue')}
                </p>
                <ProgressBar
                  label={t('clones.cooldown')}
                  value={Math.round(cooldownFraction * 100)}
                  tone={cooldown.onCooldown ? 'warning' : 'success'}
                />
                {cooldownNote && <p className="text-xs text-text-dim">{cooldownNote}</p>}
              </section>
            </Panel>
            <Panel className="h-full">
              <section aria-label={t('clones.youAreIn')} className="space-y-1">
                <h3 className={eyebrowClassName}>{t('clones.youAreIn')}</h3>
                <p>
                  {characterSystemName ?? t('clones.unknownPlace')}{' '}
                  {characterSystemId !== null && securities.has(characterSystemId) && (
                    <SecurityStatus security={securities.get(characterSystemId) ?? 0} />
                  )}
                </p>
                {hasWorn && (
                  <p className="text-xs text-text-dim">
                    {t('clones.implantCount', { count: wornIds.length })}
                    {wornValue && wornValue.unpriced < wornIds.length && (
                      <>
                        {' · '}
                        <IskAmount value={wornValue.total} /> {t('clones.atRisk')}
                        {wornValue.unpriced > 0 &&
                          ` · ${t('clones.unpriced', { count: wornValue.unpriced })}`}
                      </>
                    )}
                  </p>
                )}
              </section>
            </Panel>
            {homeLocationName && (
              <Panel className="h-full">
                <section aria-label={t('clones.respawn')} className="space-y-1">
                  <h3 className={eyebrowClassName}>{t('clones.respawn')}</h3>
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="[overflow-wrap:anywhere]">{homeLocationName}</span>
                    {homeSecurity !== undefined && <SecurityStatus security={homeSecurity} />}
                    <JumpsAwayText
                      result={homeJumps}
                      t={t}
                      locationId={homeLocation?.location_id}
                      linkClassName={TOUCH_LINK}
                    />
                  </p>
                  {lastStationChangeDate && (
                    <p className="text-xs text-text-dim">
                      {t('clones.lastStationChange', {
                        date: formatTimestamp(new Date(lastStationChangeDate), timeZone),
                      })}
                    </p>
                  )}
                </section>
              </Panel>
            )}
          </div>
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
              <ul aria-label={t('clones.title')} className="grid gap-3 p-3 md:grid-cols-2">
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
