import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  Button,
  CachedEmptyState,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  InfoTooltip,
  IskAmount,
  Panel,
  buttonClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadTypeNames } from '@/features/character/typeNames';
import { altGroupSummary } from '@/engine/pi/colonyStatus';
import { totalQuickWins } from '@/engine/pi/planAdvice';
import { formatDuration } from '@/lib/duration';
import { useExpiringWindowMs } from '../expiringWindow';
import { cadenceHours, useCadence, type PiCadenceDays } from '../cadencePref';
import { loadPlanetName } from '../names';
import { extractorProgramsFromPins } from '../adapters';
import { colonyStatus } from '@/engine/pi/colonyStatus';
import { useShowAltColonies } from '../showAltColoniesPref';
import type { RosterCharacter } from '../roster';
import { PricesUnavailable } from '../PricesUnavailable';
import { EsiDidntAnswer } from '../EsiDidntAnswer';
import { piTypeNames } from './coloniesNames';
import { useColoniesAdvice } from './useColoniesAdvice';
import { buildAltAdvice } from './altAdvice';
import { AssumedCustomsNote } from '../AssumedCustomsNote';
import { assumedCustomsNames } from '../colonyCustoms';
import { EMPTY_ROSTER, NO_DETAILS, NO_NAMES, mergeNames, type Snapshot } from './coloniesSnapshot';
import {
  colonyCheckRow,
  HOUR_MS,
  sortRows,
  todayCheck,
  type ColonyCheckRow,
} from './coloniesModel';
import { ColonyRowView } from './ColonyRowView';
import { PlanetImage } from './PlanetImage';
import { TodayPanel } from './TodayPanel';

const PLAN_HREF = '/planetary-industry/plan';

interface ColoniesTabProps {
  characterId: number;
  snapshot: Snapshot | null;
  /** The route's first load is still running. */
  loading: boolean;
  /** The route's load failed. */
  error: unknown;
  /** `?colony=`: a colony to open and focus. */
  linkedColonyId: number | null;
  onClearLinkedColony: () => void;
  /** Re-run the route's load: the Retry on the ESI-did-not-answer notice. */
  onRetry: () => void;
}

function characterNames(characters: readonly RosterCharacter[]): string {
  return characters.map((character) => character.name).join(', ');
}

/**
 * A character sub-heading above its colony rows, only once more than one
 * character's colonies are on screen. `summary` and `fetchedAt` are alt-only:
 * an alt's rows are cache-only and can be days old, so its group carries its
 * own `DataAgeBadge` rather than borrowing the page header's.
 */
function CharacterGroupHeader({
  name,
  summary,
  makesPerDay,
  fetchedAt,
  onSwitch,
}: {
  name: string;
  summary?: string;
  /** An alt's own ISK a day: shown, but never part of the plan. */
  makesPerDay?: number | null;
  fetchedAt?: Date;
  onSwitch?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-character-group-header
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-line bg-panel-2 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="max-w-full truncate">{name}</span>
        {summary && (
          <span className="shrink-0 font-normal tracking-normal normal-case">{summary}</span>
        )}
        {makesPerDay != null && (
          <span className="font-normal tracking-normal normal-case">
            <Trans
              i18nKey="pi.altColonies.makes"
              components={{ isk: <IskAmount value={makesPerDay} decimals={0} /> }}
            />
            <span className="ml-1">{t('pi.altColonies.notInPlan')}</span>
            <InfoTooltip
              className="ml-1 align-middle"
              label={t('pi.altColonies.notInPlanLabel')}
              content={t('pi.altColonies.notInPlanTooltip')}
            />
          </span>
        )}
      </div>
      {(fetchedAt || onSwitch) && (
        <div className="flex shrink-0 items-center gap-2">
          {fetchedAt && (
            <DataAgeBadge
              date={fetchedAt}
              className="shrink-0 font-normal tracking-normal normal-case"
            />
          )}
          {onSwitch && <SwitchToButton name={name} onSwitch={onSwitch} />}
        </div>
      )}
    </div>
  );
}

/** Makes an alt the active Character in place; unlike Characters' switch, it stays on this route. */
function SwitchToButton({ name, onSwitch }: { name: string; onSwitch: () => void }) {
  const { t } = useTranslation();
  return (
    <Button size="sm" className="min-h-11 shrink-0 md:min-h-0" onClick={onSwitch}>
      {t('pi.altColonies.switchTo', { name })}
    </Button>
  );
}

function NoColonies({ planHref }: { planHref: string }) {
  const { t } = useTranslation();
  const blurbs = [
    { icon: <Icon.Recent />, key: 'restart' },
    { icon: <Icon.Container />, key: 'storage' },
    { icon: <Icon.Industry />, key: 'health' },
  ] as const;
  return (
    <Panel
      title={t('piColonies.emptyPanel')}
      meta={<span className="text-[0.6875rem] font-normal">0</span>}
      padded={false}
    >
      <EmptyState
        title={t('piColonies.emptyTitle')}
        hint={t('piColonies.emptyHint')}
        icon={
          <span className="flex gap-2">
            {(['barren', 'lava', 'temperate'] as const).map((type) => (
              <PlanetImage key={type} type={type} size={40} />
            ))}
            {[0, 1, 2].map((slot) => (
              <span
                key={slot}
                aria-hidden="true"
                className="size-10 rounded-full border border-dashed border-line-bright"
              />
            ))}
          </span>
        }
        action={
          <Link to={planHref} className={buttonClassName({ variant: 'primary' })}>
            {t('piColonies.emptyAction')}
            <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          </Link>
        }
      />
      <ul className="grid divide-line border-t border-line md:grid-cols-3 md:divide-x max-md:divide-y">
        {blurbs.map(({ icon, key }) => (
          <li key={key} className="flex items-start gap-2 p-3 text-xs text-text-dim">
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {icon}
            </span>
            <span>
              <b className="block text-text">{t(`piColonies.blurb.${key}.title`)}</b>
              {t(`piColonies.blurb.${key}.body`)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ColoniesTab({
  characterId,
  snapshot: data,
  loading,
  error,
  linkedColonyId,
  onClearLinkedColony,
  onRetry,
}: ColoniesTabProps) {
  const { t } = useTranslation();
  const expiringWindowMs = useExpiringWindowMs();
  const cadence = useCadence((state) => state.value);
  const setCadence = useCadence((state) => state.setValue);
  const { haulHours } = cadenceHours(cadence);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  const showAltColonies = useShowAltColonies((state) => state.value);
  const hydrateShowAltColonies = useShowAltColonies((state) => state.hydrate);
  const setShowAltColonies = useShowAltColonies((state) => state.setValue);
  useEffect(() => {
    void hydrateShowAltColonies();
  }, [hydrateShowAltColonies]);

  // Multi-open accordion, keyed by `${characterId}:${planetId}`: two characters
  // can each hold a colony on the same planet.
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const linkedKey = linkedColonyId !== null ? `${characterId}:${linkedColonyId}` : null;
  const isExpanded = (key: string) => expandedKeys.has(key) || key === linkedKey;
  const setOpen = (key: string, open: boolean) =>
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  const toggle = (key: string) => {
    const open = isExpanded(key);
    // A `?colony=` link is a way in, not a lock: closing it drops the param.
    if (key === linkedKey && open) onClearLinkedColony();
    setOpen(key, !open);
  };
  const expand = (key: string) => setOpen(key, true);

  // Scrolled to and focused once per link, not on every refresh of the data.
  const focusedLink = useRef<string | null>(null);
  useEffect(() => {
    if (linkedColonyId === null || !data) return;
    const id = `pi-colony-${characterId}-${linkedColonyId}-trigger`;
    if (focusedLink.current === id) return;
    const trigger = document.getElementById(id);
    if (!trigger) return;
    focusedLink.current = id;
    trigger.scrollIntoView?.({ block: 'center' });
    trigger.focus({ preventScroll: true });
  }, [linkedColonyId, data, characterId]);

  const planetsResult = data?.planetsResult ?? null;
  const details = data?.details ?? NO_DETAILS;
  const cachedPlanetNames = data?.planetNames ?? NO_NAMES;
  const cachedPinTypeNames = data?.pinTypeNames ?? NO_NAMES;
  const cachedProductNames = data?.productNames ?? NO_NAMES;
  const schematicNames = data?.schematicNames ?? NO_NAMES;
  const roster = data?.roster ?? EMPTY_ROSTER;
  const pi = data?.pi ?? null;
  const activeCharacterName =
    data?.activeCharacterName ?? t('pi.characterLabel', { id: characterId });

  // Public-lookup overlay for ids the cache-only roster reads couldn't resolve,
  // filled in once the alt toggle turns on. A fresher live read always wins.
  const [publicPlanetNames, setPublicPlanetNames] = useState<ReadonlyMap<number, string>>(NO_NAMES);
  const [publicTypeNames, setPublicTypeNames] = useState<ReadonlyMap<number, string>>(NO_NAMES);
  const planetNames = useMemo(
    () => mergeNames(publicPlanetNames, cachedPlanetNames),
    [publicPlanetNames, cachedPlanetNames]
  );
  // pi.json's own names win: Plan reads them, and a P0 or a schematic's output
  // must never fall back to "Type #id" or "Unknown product" here.
  const piNames = useMemo(() => piTypeNames(pi), [pi]);
  const pinTypeNames = useMemo(
    () => mergeNames(mergeNames(publicTypeNames, cachedPinTypeNames), piNames),
    [piNames, publicTypeNames, cachedPinTypeNames]
  );
  const productNames = useMemo(
    () => mergeNames(mergeNames(publicTypeNames, cachedProductNames), piNames),
    [piNames, publicTypeNames, cachedProductNames]
  );

  // Resolve any planet/type name the cache-only reads left unresolved through
  // the public, globally cached lookups, and only once the toggle is on, so a
  // page open with it off never fans out. Planet names have no bulk endpoint,
  // so those go one GET per id, capped at `ESI_FANOUT_CONCURRENCY` in flight.
  useEffect(() => {
    if (!showAltColonies) return;
    const missingTypeIds = new Set<number>();
    for (const colony of roster.colonies) {
      for (const pin of colony.detail?.pins ?? []) {
        if (!pinTypeNames.has(pin.type_id) && !productNames.has(pin.type_id)) {
          missingTypeIds.add(pin.type_id);
        }
        const productId = pin.extractor_details?.product_type_id;
        if (
          productId !== undefined &&
          !pinTypeNames.has(productId) &&
          !productNames.has(productId)
        ) {
          missingTypeIds.add(productId);
        }
      }
    }
    const missingPlanetIds = [
      ...new Set(
        roster.colonies
          .map((colony) => colony.planet.planet_id)
          .filter((id) => !planetNames.has(id))
      ),
    ];
    if (missingTypeIds.size === 0 && missingPlanetIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const resolvedPlanetNames = new Map<number, string>();
      const [typeNames] = await Promise.all([
        missingTypeIds.size > 0 ? loadTypeNames([...missingTypeIds]) : Promise.resolve(NO_NAMES),
        mapWithConcurrencyLimit(missingPlanetIds, ESI_FANOUT_CONCURRENCY, async (id) => {
          const name = await loadPlanetName(id);
          if (name) resolvedPlanetNames.set(id, name);
        }),
      ]);
      if (cancelled) return;
      if (typeNames.size > 0) setPublicTypeNames((prev) => new Map([...prev, ...typeNames]));
      if (resolvedPlanetNames.size > 0) {
        setPublicPlanetNames((prev) => new Map([...prev, ...resolvedPlanetNames]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAltColonies, roster.colonies, pinTypeNames, productNames, planetNames]);

  // The shared recommendation model: quick wins and today's figure come from
  // the same `buildPlanAdvice` Plan reads. It carries its own clock, so status
  // and fixes agree about whether a program has expired.
  const planAdvice = useColoniesAdvice(data ? characterId : null, data?.loadedAt ?? 0);
  const advice = planAdvice.advice;
  const nowMs = planAdvice.snapshot?.nowMs ?? data?.loadedAt ?? 0;

  const planets = useMemo(() => planetsResult?.data ?? [], [planetsResult]);
  const ownRows = useMemo(
    () =>
      sortRows(
        planets.map((planet) =>
          colonyCheckRow({
            characterId,
            planet,
            detail: details.get(planet.planet_id)?.cached?.data ?? null,
            pi,
            radiusKm: planAdvice.snapshot?.planetRadiusKm.get(planet.planet_id) ?? null,
            nowMs,
            windowMs: expiringWindowMs,
            haulHours,
            advice: advice?.colonies.find((c) => c.planetId === planet.planet_id) ?? null,
          })
        )
      ),
    [
      planets,
      details,
      pi,
      planAdvice.snapshot,
      nowMs,
      expiringWindowMs,
      haulHours,
      advice,
      characterId,
    ]
  );

  // Alt colonies grouped by character, each sorted worst-first like the active
  // Character's own. Their figures come from `buildAltAdvice` (unknown skills,
  // priced conservatively) and are display-only: Plan and the Today figures
  // above read the active Character's advice alone.
  const altAdvice = useMemo(
    () =>
      planAdvice.input && showAltColonies
        ? buildAltAdvice(planAdvice.input, roster.colonies)
        : null,
    [planAdvice.input, roster.colonies, showAltColonies]
  );
  const altGroups = useMemo(() => {
    const byCharacter = new Map<
      number,
      {
        characterName: string;
        fetchedAt: Date;
        colonies: {
          row: ColonyCheckRow;
          planet: (typeof roster.colonies)[number]['planet'];
          detail: (typeof roster.colonies)[number]['detail'];
        }[];
      }
    >();
    for (const colony of roster.colonies) {
      const row = colonyCheckRow({
        characterId: colony.characterId,
        planet: colony.planet,
        detail: colony.detail,
        pi,
        radiusKm: planAdvice.snapshot?.planetRadiusKm.get(colony.planet.planet_id) ?? null,
        nowMs,
        windowMs: expiringWindowMs,
        haulHours,
        advice: altAdvice?.get(colony.characterId)?.byPlanetId.get(colony.planet.planet_id) ?? null,
        dataAgeHours: Math.max(0, (nowMs - colony.oldestFetchedAt.getTime()) / HOUR_MS),
      });
      const group = byCharacter.get(colony.characterId);
      const entry = { row, planet: colony.planet, detail: colony.detail };
      if (group) group.colonies.push(entry);
      else
        byCharacter.set(colony.characterId, {
          characterName: colony.characterName,
          fetchedAt: colony.oldestFetchedAt,
          colonies: [entry],
        });
    }
    return [...byCharacter.entries()].map(([altId, group]) => {
      const sorted = sortRows(group.colonies.map((entry) => entry.row));
      const byKey = new Map(group.colonies.map((entry) => [entry.row.key, entry]));
      return {
        characterId: altId,
        characterName: group.characterName,
        fetchedAt: group.fetchedAt,
        makesPerDay: altAdvice?.get(altId)?.makesPerDay ?? null,
        colonies: sorted.map((row) => ({ ...byKey.get(row.key)!, row })),
        summary: altGroupSummary(
          group.colonies.map((entry) =>
            colonyStatus(entry.detail ? extractorProgramsFromPins(entry.detail.pins) : [], nowMs)
          )
        ),
      };
    });
  }, [roster, pi, planAdvice.snapshot, altAdvice, nowMs, expiringWindowMs, haulHours]);

  const otherCharacterCount =
    altGroups.length + roster.skipped.length + roster.notLoaded.length + roster.noColonies.length;
  const hasOtherCharacters = otherCharacterCount > 0;
  const hasAnyColoniesSurface = ownRows.length > 0 || hasOtherCharacters;

  const includeAlts = showAltColonies && altGroups.length > 0;
  const todayRows = useMemo(
    () => [
      ...ownRows,
      ...(includeAlts ? altGroups.flatMap((g) => g.colonies.map((c) => c.row)) : []),
    ],
    [ownRows, altGroups, includeAlts]
  );
  const check = useMemo(() => todayCheck(todayRows, nowMs), [todayRows, nowMs]);

  const characterNameOf = (id: number) =>
    id === characterId
      ? activeCharacterName
      : (altGroups.find((g) => g.characterId === id)?.characterName ??
        t('pi.characterLabel', { id }));
  const nameOf = (row: ColonyCheckRow) =>
    planetNames.get(row.planetId) ?? t('pi.planetLabel', { id: row.planetId });
  const haulLabel = t(`piColonies.haulWord.${cadence.haulDays}`);
  const wins = advice ? totalQuickWins(advice.quickWins) : null;

  if (loading && !data) return null;

  return (
    <>
      {!!error && (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      )}

      {data?.planetsFetchFailed && <EsiDidntAnswer onRetry={onRetry} />}

      {!hasAnyColoniesSurface ? (
        !error &&
        !data?.planetsFetchFailed &&
        (planetsResult && !planetsResult.fromCache ? (
          <NoColonies planHref={PLAN_HREF} />
        ) : (
          <CachedEmptyState
            result={planetsResult}
            title={t('pi.emptyTitle')}
            hint={t('pi.emptyHint')}
            fetchedTitle={t('pi.emptyFetchedTitle')}
          />
        ))
      ) : (
        <>
          {planAdvice.pricesFailed && <PricesUnavailable />}
          {ownRows.length > 0 || includeAlts ? (
            <TodayPanel
              rows={todayRows}
              check={check}
              nowMs={nowMs}
              nameOf={nameOf}
              characterNameOf={characterNameOf}
              activeCharacterId={characterId}
              todayPerDay={advice?.totals.todayPerDay ?? null}
              fixCount={advice?.quickWins.length ?? 0}
              fixGainPerDay={wins?.gainPerDay ?? 0}
              ownCount={ownRows.length}
              includesOthers={includeAlts}
              fetchedAt={planetsResult ? new Date(planetsResult.fetchedAt) : null}
              cadence={cadence}
              onHaulDaysChange={(days: PiCadenceDays) =>
                void setCadence({ ...cadence, haulDays: days })
              }
              planHref={PLAN_HREF}
            />
          ) : null}

          <AssumedCustomsNote
            names={assumedCustomsNames(advice?.colonies ?? [], (id) => t('pi.planetLabel', { id }))}
          />

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-dim">
            <span>
              <b className="text-text">{t('piColonies.cantSee.lead')}</b>{' '}
              {t('piColonies.cantSee.body')}
            </span>
            <InfoTooltip label={t('pi.stalenessLabel')} content={t('pi.stalenessTooltip')} />
            {planetsResult && (
              <span className="inline-flex items-center gap-1">
                {t('piColonies.cantSee.updated')}
                <DataAgeBadge date={new Date(planetsResult.fetchedAt)} />
              </span>
            )}
          </p>
          {planetsResult?.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          <Panel
            title={t('pi.colonies.panelTitle', {
              count: ownRows.length + (showAltColonies ? roster.colonies.length : 0),
            })}
            meta={<span className="font-normal normal-case">{t('piColonies.attentionFirst')}</span>}
            actions={
              hasOtherCharacters ? (
                <FilterChip
                  label={t('pi.altColonies.toggleLabel', { count: otherCharacterCount })}
                  selected={showAltColonies}
                  onToggle={() => void setShowAltColonies(!showAltColonies)}
                />
              ) : undefined
            }
            padded={false}
          >
            {ownRows.length === 0 ? (
              <EmptyState
                title={t('pi.noOwnColoniesTitle')}
                hint={showAltColonies ? undefined : t('pi.noOwnColoniesHint')}
                className="py-6"
              />
            ) : (
              <>
                {showAltColonies && <CharacterGroupHeader name={activeCharacterName} />}
                {ownRows.map((row, index) => {
                  const planet = planets.find((p) => p.planet_id === row.planetId)!;
                  return (
                    <ColonyRowView
                      key={row.key}
                      row={row}
                      planet={planet}
                      detail={details.get(row.planetId)?.cached?.data ?? null}
                      pi={pi}
                      nowMs={nowMs}
                      planetName={nameOf(row)}
                      pinTypeNames={pinTypeNames}
                      productNames={productNames}
                      schematicNames={schematicNames}
                      expanded={isExpanded(row.key)}
                      onToggle={() => toggle(row.key)}
                      onExpand={() => expand(row.key)}
                      primary={index === 0}
                      own
                      haulLabel={haulLabel}
                    />
                  );
                })}
              </>
            )}

            {showAltColonies &&
              altGroups.map((group) => {
                const summaryParts: string[] = [];
                if (group.summary.stoppedCount > 0) {
                  summaryParts.push(
                    t('pi.altColonies.summaryStopped', { count: group.summary.stoppedCount })
                  );
                }
                if (group.summary.nextExpiryMs !== null) {
                  summaryParts.push(
                    t('pi.altColonies.summaryNext', {
                      duration: formatDuration(
                        Math.max(0, group.summary.nextExpiryMs - nowMs) / 1000
                      ),
                    })
                  );
                }
                return (
                  <div key={group.characterId}>
                    <CharacterGroupHeader
                      name={group.characterName}
                      summary={summaryParts.length > 0 ? summaryParts.join(' · ') : undefined}
                      makesPerDay={group.makesPerDay}
                      fetchedAt={group.fetchedAt}
                      onSwitch={() => void setActiveCharacter(group.characterId)}
                    />
                    {group.colonies.map(({ row, planet, detail }) => (
                      <ColonyRowView
                        key={row.key}
                        row={row}
                        planet={planet}
                        detail={detail}
                        pi={pi}
                        nowMs={nowMs}
                        planetName={nameOf(row)}
                        pinTypeNames={pinTypeNames}
                        productNames={productNames}
                        schematicNames={schematicNames}
                        expanded={isExpanded(row.key)}
                        onToggle={() => toggle(row.key)}
                        onExpand={() => expand(row.key)}
                        primary={false}
                        own={false}
                        switchTo={{
                          name: group.characterName,
                          onSwitch: () => void setActiveCharacter(group.characterId),
                        }}
                        haulLabel={haulLabel}
                      />
                    ))}
                  </div>
                );
              })}

            {showAltColonies &&
              (roster.notLoaded.length > 0 ||
                roster.noColonies.length > 0 ||
                roster.skipped.length > 0) && (
                <ul className="space-y-1 border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                  {roster.notLoaded.map((character) => (
                    <li
                      key={character.characterId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{t('pi.altColonies.notLoaded', { name: character.name })}</span>
                      <SwitchToButton
                        name={character.name}
                        onSwitch={() => void setActiveCharacter(character.characterId)}
                      />
                    </li>
                  ))}
                  {roster.noColonies.length > 0 && (
                    <li>
                      {t('pi.altColonies.noColonies', { names: characterNames(roster.noColonies) })}
                    </li>
                  )}
                  {roster.skipped.length > 0 && (
                    <li className="text-warning">
                      {t('pi.altColonies.skipped', { names: characterNames(roster.skipped) })}
                    </li>
                  )}
                </ul>
              )}
          </Panel>
        </>
      )}
    </>
  );
}
