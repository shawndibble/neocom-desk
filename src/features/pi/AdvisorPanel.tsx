/**
 * The Advisor: one card per planet in a system, built or not, answering "what
 * is this planet doing, and what has it got room for".
 *
 * ## Why a third tab rather than more of the other two
 *
 * Colonies shows what is already running, planet by planet. Plan starts from
 * a product and works backwards, and is deliberately planet-agnostic. Neither
 * answers the question a planner actually opens the page with: *this* system,
 * *these* planets, what fits. That is a CPU/Powergrid question — the game caps
 * a colony by budget, not by pin count — so the Advisor is the surface for
 * `engine/pi/pinBudget.ts` and its per-kind headroom.
 *
 * ## Measured only, and the estimate is deliberately absent
 *
 * Every number on a built card is read: the pins from ESI, the extraction rate
 * from each program's own decay curve, the budget from the character's trained
 * Command Center Upgrades. An unbuilt planet gets its type and the P0
 * resources that type yields, and then stops — see `advisorModel.ts` for why
 * an ISK estimate would need a richness figure no ESI field carries and a
 * resource ranking this app does not yet store. A card that says "we do not
 * know" is worth more than one that says a plausible number.
 *
 * ## The system picker offers systems the character has colonies in
 *
 * Not an arbitrary system search. With no rank-order input to fall back on, a
 * system the character has never colonised would render nothing but
 * unmeasurable cards — the search would be a control that cannot pay off yet.
 * The planet list for the chosen system still comes from
 * `/universe/systems/{id}`, so unbuilt planets in a system the character is
 * already in do appear, which is where the useful comparison is anyway.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, NativeSelect, Panel, ReauthBanner, Spinner, StatChip } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { loadPi } from '@/sde/loadSde';
import type { PiData, PiPinKind } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetType } from '@/esi/endpoints';
import { EXTRACTOR_HEADS_MAX, spareCapacity } from '@/engine/pi/pinBudget';
import type { PinLoad } from '@/engine/pi/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadSystemName, loadSystemPlanetIds } from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterPlanets, loadAllColonyDetails } from './data';
import { loadCommandCenterUpgrades, maxColonyBudget, type MaxColonyBudget } from './colonyBudget';
import { loadPlanetInfo, loadSchematicName } from './names';
import { systemAdvice, type PlanetAdvice, type SystemPlanet } from './advisorModel';

/** The kinds worth offering as headroom, in the order a planner reaches for them. */
const HEADROOM_KINDS: readonly PiPinKind[] = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
  'storage',
  'launchpad',
];

/**
 * Heads assumed when costing a *hypothetical* extra extractor for the
 * headroom row: a full complement. An ECU fitted with fewer heads reaches
 * less, so quoting the cheap end would promise room for an extractor nobody
 * would actually build.
 */
const HEADROOM_EXTRACTOR_HEADS = EXTRACTOR_HEADS_MAX;

interface SystemGroup {
  systemId: number;
  name: string | null;
  colonies: CharacterPlanet[];
}

interface Snapshot {
  pi: PiData;
  systems: SystemGroup[];
  details: Map<number, CharacterPlanetDetail>;
  planetsBySystem: Map<number, SystemPlanet[]>;
  /** The most any colony here could supply, for unbuilt planets and the header. Built cards use their own. */
  ceiling: MaxColonyBudget;
  /** True when the planets read came back 403 — a missing scope, not an empty colony list. */
  needsReauth: boolean;
  schematicNames: Map<number, string>;
  typeNames: Map<number, string>;
}

async function loadAdvisorSnapshot(characterId: number): Promise<Snapshot> {
  const nowMs = Date.now();
  const [pi, { cached, needsReauth }, ccLevel] = await Promise.all([
    loadPi(),
    loadCharacterPlanets(characterId),
    loadCommandCenterUpgrades(characterId, nowMs),
  ]);
  const colonies = cached?.data ?? [];

  const bySystem = new Map<number, CharacterPlanet[]>();
  for (const colony of colonies) {
    const list = bySystem.get(colony.solar_system_id) ?? [];
    list.push(colony);
    bySystem.set(colony.solar_system_id, list);
  }
  const systemIds = [...bySystem.keys()];

  const [details, systemNames, planetIdLists] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      colonies.map((colony) => colony.planet_id)
    ),
    Promise.all(systemIds.map((systemId) => loadSystemName(systemId))),
    Promise.all(systemIds.map((systemId) => loadSystemPlanetIds(systemId))),
  ]);

  // One `/universe/planets` read per planet across every system the character
  // has a colony in — six systems of eight planets is ~48 reads on a cold
  // cache. Capped, and capped over ONE flat list rather than per system:
  // wrapping each system's own loop would still let systems x cap run at
  // once, which is the shape `src/lib/concurrency.ts` exists to prevent.
  // Rows are static (a planet is never renamed), so this is a first-visit
  // cost only.
  const lookups = systemIds.flatMap((systemId, i) =>
    planetIdLists[i].map((planetId) => ({ systemId, planetId }))
  );
  const planetInfo = new Map<number, { name: string; typeId: number } | null>();
  await mapWithConcurrencyLimit(lookups, ESI_FANOUT_CONCURRENCY, async ({ planetId }) => {
    planetInfo.set(planetId, await loadPlanetInfo(planetId));
  });

  const planetsBySystem = new Map<number, SystemPlanet[]>();
  systemIds.forEach((systemId, i) => {
    planetsBySystem.set(
      systemId,
      planetIdLists[i].map((planetId) => {
        const info = planetInfo.get(planetId) ?? null;
        return {
          planetId,
          name: info?.name ?? null,
          // `null`, never a sentinel: a failed lookup means the type is
          // unknown, which the model keeps distinct from a planet that takes
          // no colony. A stand-in id would collapse the two.
          typeId: info?.typeId ?? null,
        };
      })
    );
  });

  const flatDetails = new Map<number, CharacterPlanetDetail>();
  for (const [planetId, result] of details) {
    const data = result.cached?.data;
    if (data) flatDetails.set(planetId, data);
  }

  const allPins = [...flatDetails.values()].flatMap((detail) => detail.pins);
  const schematicIds = [
    ...new Set(
      allPins
        .map((pin) => pin.factory_details?.schematic_id ?? pin.schematic_id)
        .filter((id): id is number => id !== undefined)
    ),
  ];
  const productTypeIds = [
    ...new Set(
      allPins
        .map((pin) => pin.extractor_details?.product_type_id)
        .filter((id): id is number => id !== undefined)
    ),
  ];
  const [schematicNameList, typeNames] = await Promise.all([
    Promise.all(schematicIds.map((id) => loadSchematicName(id))),
    loadTypeNames(productTypeIds),
  ]);
  const schematicNames = new Map<number, string>();
  schematicIds.forEach((id, i) => {
    const name = schematicNameList[i];
    if (name) schematicNames.set(id, name);
  });

  return {
    pi,
    systems: systemIds.map((systemId, i) => ({
      systemId,
      name: systemNames[i],
      colonies: bySystem.get(systemId) ?? [],
    })),
    details: flatDetails,
    planetsBySystem,
    ceiling: maxColonyBudget(ccLevel, pi),
    needsReauth,
    schematicNames,
    typeNames,
  };
}

/** One axis of the CPU/Powergrid meter. */
function BudgetBar({
  label,
  used,
  budget,
  unit,
}: {
  label: string;
  used: number;
  budget: number;
  unit: string;
}) {
  const { t } = useTranslation();
  const percent = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const tight = percent >= 90;
  return (
    <div className="flex items-center gap-2 text-[0.625rem] text-text-dim">
      <span className="w-8 shrink-0 font-semibold tracking-wide uppercase">{label}</span>
      <div
        role="progressbar"
        aria-label={t('piAdvisor.budgetBarLabel', { axis: label })}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2"
      >
        <div
          className={`h-full ${tight ? 'bg-warning' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums">
        {t('piAdvisor.budgetBarValue', {
          used: Math.round(used).toLocaleString(),
          budget: Math.round(budget).toLocaleString(),
          unit,
        })}
      </span>
    </div>
  );
}

/**
 * The card shell every planet card shares: name (falling back to the planet
 * id) and, when known, the planet type. Three cards repeated this markup
 * before; the only thing that varied was the body.
 */
function PlanetCard({
  planetId,
  name,
  planetType,
  dashed = false,
  dim = false,
  children,
}: {
  planetId: number;
  name: string | null;
  planetType: PlanetType | null;
  dashed?: boolean;
  dim?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex flex-col rounded-xs border bg-panel ${
        dashed ? 'border-dashed border-line-bright' : 'border-line'
      } ${dim ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-2">
        <span className="text-sm font-semibold">
          {name ?? t('pi.planetLabel', { id: planetId })}
        </span>
        {planetType && (
          <span className="text-[0.625rem] tracking-wide text-text-dim uppercase">
            {t(`pi.planetType.${planetType}`)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">{children}</div>
    </div>
  );
}

/** A card body's small label/value line. */
function CardLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
        {label}
      </span>
      <div className="text-text">{children}</div>
    </div>
  );
}

function BuiltCard({
  advice,
  pi,
  schematicNames,
  typeNames,
}: {
  advice: Extract<PlanetAdvice, { kind: 'built' }>;
  pi: PiData;
  schematicNames: ReadonlyMap<number, string>;
  typeNames: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  const { colony } = advice;
  // This colony's own Command Center budget, from its own upgrade level —
  // not the pilot's skill ceiling, which would overstate the headroom of
  // every colony not upgraded to it.
  const budget: PinLoad = colony.budget;
  const headroom = useMemo(
    () =>
      spareCapacity(colony.pinLoad.load, budget, pi.infrastructure, {
        headsPerExtractor: HEADROOM_EXTRACTOR_HEADS,
      }),
    [colony.pinLoad.load, budget, pi.infrastructure]
  );
  const room = HEADROOM_KINDS.filter((kind) => (headroom[kind] ?? 0) > 0);

  return (
    <PlanetCard planetId={advice.planetId} name={advice.name} planetType={advice.planetType}>
      <>
        {!colony.detailLoaded ? (
          <p className="text-xs text-warning">{t('piAdvisor.detailUnavailable')}</p>
        ) : null}

        {colony.extractedPerHour.length > 0 && (
          <CardLine label={t('piAdvisor.extractingLabel')}>
            <ul className="space-y-0.5">
              {colony.extractedPerHour.map((line) => (
                <li key={line.typeId} className="flex items-baseline justify-between gap-2">
                  <span>{typeNames.get(line.typeId) ?? t('pi.unknownProduct')}</span>
                  <span className="tabular-nums text-text-dim">
                    {t('piAdvisor.unitsPerHour', {
                      units: Math.round(line.unitsPerHour).toLocaleString(),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardLine>
        )}
        {colony.detailLoaded && colony.extractedPerHour.length === 0 && (
          <p className="text-xs text-text-dim">{t('piAdvisor.noMeasuredExtraction')}</p>
        )}

        {colony.production.length > 0 && (
          <CardLine label={t('piAdvisor.makingLabel')}>
            <ul className="space-y-0.5">
              {colony.production.map((group) => (
                <li
                  key={String(group.schematicId)}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span>
                    {group.schematicId !== undefined
                      ? (schematicNames.get(group.schematicId) ?? t('pi.unknownSchematic'))
                      : t('pi.unknownSchematic')}
                  </span>
                  <span className="tabular-nums text-text-dim">
                    {t('piAdvisor.facilityCount', { count: group.count })}
                  </span>
                </li>
              ))}
            </ul>
          </CardLine>
        )}

        <div className="space-y-1">
          <BudgetBar
            label={t('piAdvisor.cpu')}
            used={colony.pinLoad.load.cpu}
            budget={budget.cpu}
            unit={t('piAdvisor.cpuUnit')}
          />
          <BudgetBar
            label={t('piAdvisor.powergrid')}
            used={colony.pinLoad.load.powergrid}
            budget={budget.powergrid}
            unit={t('piAdvisor.powergridUnit')}
          />
        </div>

        {colony.pinLoad.unknownTypeIds.length > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piAdvisor.unknownPins', { count: colony.pinLoad.unknownTypeIds.length })}
          </p>
        )}

        <div className="mt-auto border-t border-line pt-2">
          {/*
            A colony with links has a load this app cannot fully measure, so it
            gets no headroom figure at all — the same rule the unbuilt cards
            follow: name what is true, print no number that isn't. Showing
            "room for 12 factories" to a pilot whose colony is full is the one
            failure this tab exists to avoid.
          */}
          {colony.linkCount > 0 ? (
            <p className="text-[0.6875rem] text-warning">
              {t('piAdvisor.roomUnknownLinks', { count: colony.linkCount })}
            </p>
          ) : (
            <CardLine label={t('piAdvisor.roomForLabel')}>
              {room.length === 0 ? (
                <span className="text-text-dim">{t('piAdvisor.roomForNothing')}</span>
              ) : (
                <span className="text-text-dim">
                  {room
                    .map((kind) =>
                      t('piAdvisor.roomForItem', {
                        count: headroom[kind],
                        pin: t(`piAdvisor.pinKind.${kind}`),
                      })
                    )
                    .join(' · ')}
                </span>
              )}
            </CardLine>
          )}
        </div>
      </>
    </PlanetCard>
  );
}

function UnbuiltCard({ advice }: { advice: Extract<PlanetAdvice, { kind: 'unbuilt' }> }) {
  const { t } = useTranslation();
  return (
    <PlanetCard planetId={advice.planetId} name={advice.name} planetType={advice.planetType} dashed>
      <>
        <CardLine label={t('piAdvisor.couldExtractLabel')}>
          <span className="text-text-dim">
            {advice.localResources.map((resource) => resource.name).join(', ')}
          </span>
        </CardLine>
        <p className="mt-auto text-[0.6875rem] text-text-dim">{t('piAdvisor.needsScanHint')}</p>
      </>
    </PlanetCard>
  );
}

/**
 * A planet whose `/universe/planets` read has not resolved. Says so, rather
 * than borrowing the uncolonisable card's "no colony can be placed here" —
 * that would be a confident false claim about a planet we simply failed to
 * look up.
 */
function UnknownTypeCard({ advice }: { advice: Extract<PlanetAdvice, { kind: 'unknown-type' }> }) {
  const { t } = useTranslation();
  return (
    <PlanetCard planetId={advice.planetId} name={advice.name} planetType={null} dashed>
      <p className="text-xs text-text-dim">{t('piAdvisor.unknownTypeHint')}</p>
    </PlanetCard>
  );
}

function UncolonisableCard({
  advice,
}: {
  advice: Extract<PlanetAdvice, { kind: 'uncolonisable' }>;
}) {
  const { t } = useTranslation();
  return (
    <PlanetCard planetId={advice.planetId} name={advice.name} planetType={null} dashed dim>
      <p className="text-xs text-text-dim">{t('piAdvisor.uncolonisableHint')}</p>
    </PlanetCard>
  );
}

export interface AdvisorPanelProps {
  characterId: number;
  /** Which system's cards to show, from the URL; falls back to the first the character has a colony in. */
  systemId: number | null;
  onSystemIdChange: (systemId: number) => void;
}

export function AdvisorPanel({ characterId, systemId, onSystemIdChange }: AdvisorPanelProps) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await loadAdvisorSnapshot(characterId);
        if (cancelled) return;
        // Both reset on every run, not just on success: without this one
        // failure pins the error state forever, so a later character that
        // loads fine still renders the failure.
        setFailed(false);
        setSnapshot(next);
      } catch {
        if (cancelled) return;
        setSnapshot(null);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const systems = snapshot?.systems ?? [];
  const activeSystem = systems.find((system) => system.systemId === systemId) ?? systems[0] ?? null;

  const advice = useMemo(() => {
    if (!snapshot || !activeSystem) return [];
    return systemAdvice(
      {
        planets: snapshot.planetsBySystem.get(activeSystem.systemId) ?? [],
        colonies: activeSystem.colonies,
        details: snapshot.details,
      },
      snapshot.pi
    );
  }, [snapshot, activeSystem]);

  if (failed) {
    return <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  }
  if (!snapshot) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  // A 403 is a missing scope, not an empty colony list — offering "place a
  // colony" to someone who just needs to log in again would be the wrong
  // instruction entirely.
  if (snapshot.needsReauth) {
    return (
      <ReauthBanner
        title={t('pi.reauthTitle')}
        hint={t('pi.reauthHint')}
        actionLabel={t('pi.reauthAction')}
        onLogin={() => void beginEveLogin()}
      />
    );
  }
  if (!activeSystem) {
    return <EmptyState title={t('piAdvisor.emptyTitle')} hint={t('piAdvisor.emptyHint')} />;
  }

  const builtCount = advice.filter((entry) => entry.kind === 'built').length;
  const colonisable = advice.filter(
    (entry) => entry.kind === 'built' || entry.kind === 'unbuilt'
  ).length;

  // The header chip states the pilot's *ceiling*, not any colony's budget —
  // each built card reads its own Command Center's upgrade level. It reads
  // two ways, a trained level or an assumed untrained one, and must never
  // present the second as the first.
  const ceilingNumbers = t('piAdvisor.ccUpgradesValue', {
    level: snapshot.ceiling.level,
    cpu: snapshot.ceiling.budget.cpu.toLocaleString(),
    powergrid: snapshot.ceiling.budget.powergrid.toLocaleString(),
  });
  const ceilingChipValue = snapshot.ceiling.assumed
    ? t('piAdvisor.ccUpgradesAssumed', { numbers: ceilingNumbers })
    : ceilingNumbers;

  return (
    <div className="space-y-3">
      <Panel title={t('piAdvisor.controlsTitle')}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('piAdvisor.system')}
            </span>
            <NativeSelect
              value={String(activeSystem.systemId)}
              onChange={(event) => onSystemIdChange(Number(event.target.value))}
            >
              {systems.map((system) => (
                <option key={system.systemId} value={system.systemId}>
                  {system.name ?? t('piAdvisor.systemLabel', { id: system.systemId })}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="flex flex-wrap gap-2">
            <StatChip
              label={t('piAdvisor.ccUpgrades')}
              value={ceilingChipValue}
              tooltip={
                snapshot.ceiling.assumed
                  ? t('piAdvisor.ccUpgradesAssumedTooltip')
                  : t('piAdvisor.ccUpgradesTooltip')
              }
              tone={snapshot.ceiling.assumed ? 'warning' : 'accent'}
            />
            <StatChip
              label={t('piAdvisor.colonised')}
              value={t('piAdvisor.colonisedValue', { built: builtCount, total: colonisable })}
            />
          </div>
        </div>
      </Panel>

      {advice.length === 0 ? (
        <EmptyState title={t('piAdvisor.noPlanetsTitle')} hint={t('piAdvisor.noPlanetsHint')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {advice.map((entry) =>
            entry.kind === 'built' ? (
              <BuiltCard
                key={entry.planetId}
                advice={entry}
                pi={snapshot.pi}
                schematicNames={snapshot.schematicNames}
                typeNames={snapshot.typeNames}
              />
            ) : entry.kind === 'unbuilt' ? (
              <UnbuiltCard key={entry.planetId} advice={entry} />
            ) : entry.kind === 'unknown-type' ? (
              <UnknownTypeCard key={entry.planetId} advice={entry} />
            ) : (
              <UncolonisableCard key={entry.planetId} advice={entry} />
            )
          )}
        </div>
      )}

      <p className="text-xs text-text-dim">{t('piAdvisor.measuredOnlyHint')}</p>
    </div>
  );
}
