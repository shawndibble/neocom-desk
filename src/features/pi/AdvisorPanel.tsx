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
 * ## Measured first, and everything projected from it says so
 *
 * Every number on a built card is read: the pins from ESI, the extraction rate
 * from each program's own decay curve, the budget from the colony's own
 * Command Center level. Two figures are projections rather than readings, and
 * both are labelled where they appear — an unbuilt planet's estimated value
 * (#425), which rests on the pilot's own ranking and their own colonies'
 * average rate, and a built colony's "build up to" recommendation (#426),
 * which fits candidate layouts against that colony's own measured budget,
 * links and extraction rate. Neither is ever a number with a caveat beside
 * it: where an input is missing, the card names the input instead. A card that
 * says "we do not know" is worth more than one that says a plausible number.
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  EmptyState,
  Panel,
  ReauthBanner,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
} from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { formatIsk } from '@/lib/isk';
import { loadPi, loadPiPlanetRadius } from '@/sde/loadSde';
import { db } from '@/db';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadPlanPrices } from './planPrices';
import { clearPlanetRichness, setPlanetRichness } from '@/sync';
import { ResourcePicker } from './ResourcePicker';
import { assumedExtractionRate, type AssumedRate } from './richnessEstimate';
import type { PiData } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetType } from '@/esi/endpoints';
import type { PinLoad } from '@/engine/pi/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  loadSystemName,
  loadSystemPlanetIds,
  loadSystemSecurity,
  readCachedSystemSecurity,
} from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterPlanets, loadAllColonyDetails } from './data';
import { loadCommandCenterUpgrades, maxColonyBudget, type MaxColonyBudget } from './colonyBudget';
import {
  loadInterplanetaryConsolidation,
  planetSlots,
  PLANET_SLOTS_MAX,
  type PlanetSlots,
} from './planetSlots';
import { loadPlanetInfo, loadSchematicName } from './names';
import { plannableTypeIds } from './products';
import { systemAdvice, type PlanetAdvice, type SystemPlanet } from './advisorModel';
import { loadPiRosterSnapshot } from './roster';
import { useAltColonies } from './altColoniesPref';
import { colonyStopTierAdvice } from './stopTierModel';
import { colonyNetwork } from './networkModel';
import { NetworkPanel } from './NetworkPanel';
import { ColonyDirectives, StopTierRow } from './ColonyActions';
import { ColonyDetail } from './ColonyDetailModal';
import { useColonyPlan } from './colonyPlan';
import { DirectiveRow, EstimateBadge, LoadMeter, SectionLabel } from './DirectiveRow';
import { medianNewLinkLoad, unbuiltPlanAdvice, type UnbuiltPlanAdvice } from './unbuiltPlanModel';
import { useMarketSourcing } from './marketSourcingPref';
import type { NetworkConversion, NetworkOpportunity } from '@/engine/pi/network';
import {
  colonySpaceFor,
  customsRatePercent,
  customsRateSource,
  defaultCustomsRate,
  loadCustomsCodeExpertise,
  type CustomsRateSource,
} from './customsRate';

/** Stable identities, so an unranked planet's card does not remount every render. */
const EMPTY_ORDER: readonly number[] = [];
const EMPTY_RICHNESS: ReadonlyMap<number, number[]> = new Map();

interface SystemGroup {
  systemId: number;
  name: string | null;
  colonies: CharacterPlanet[];
  /**
   * The customs rate a chain here is costed at, derived from the system's own
   * security band and the character's Customs Code Expertise — not asked for.
   * The Plan tab asks because it answers for no particular system; the Advisor
   * knows exactly which system it is showing.
   */
  customsRate: number;
  customsSource: CustomsRateSource;
}

/**
 * Where the customs rate came from, in words. One branch per source, each
 * passing only the values its own sentence uses — feeding every key every
 * placeholder means shipping a `level: 0` to a sentence with no level in it.
 */
function customsTooltip(source: CustomsRateSource, t: TFunction): string {
  switch (source.kind) {
    case 'highsec-skill':
      return t('piAdvisor.customsRateSource.highsec-skill', { level: source.level });
    case 'highsec-unknown-skill':
      return t('piAdvisor.customsRateSource.highsec-unknown-skill');
    case 'player-poco':
      return t('piAdvisor.customsRateSource.player-poco', {
        space: t(`common.spaceOption.${source.space}`),
      });
  }
}

interface Snapshot {
  pi: PiData;
  systems: SystemGroup[];
  details: Map<number, CharacterPlanetDetail>;
  planetsBySystem: Map<number, SystemPlanet[]>;
  /** The most any colony here could supply, for unbuilt planets and the header. Built cards use their own. */
  ceiling: MaxColonyBudget;
  /**
   * How many colonies this character may run at once, from their
   * Interplanetary Consolidation. The Advisor used to carry no such figure at
   * all, and its "N / M planets" chip — which counts colonisable planets in
   * the system on screen — got read as one.
   */
  slots: PlanetSlots;
  /**
   * Colonies this character has, across every system. The cap is per
   * character, so counting only the system on screen would tell a pilot with
   * colonies in three systems they had slots they do not.
   */
  colonyCount: number;
  /** True when the planets read came back 403 — a missing scope, not an empty colony list. */
  needsReauth: boolean;
  schematicNames: Map<number, string>;
  typeNames: Map<number, string>;
  /** This character's saved resource rankings, by planetId. Absent means unranked. */
  richness: Map<number, number[]>;
  /** Planet radius in km by planetId, for costing links (#440). */
  planetRadiusKm: Map<number, number>;
  /**
   * Hub prices for every planetary commodity there is — every P0 and every
   * schematic output. One call for the whole payload, not one per card: the
   * set is fixed at about eighty types whatever the character owns, so this is
   * a constant, not a fan-out that grows with the system. A type the hub does
   * not quote is absent, never zero — both `estimateUnbuiltPlanet` and
   * `recommendStopTier` refuse rather than pricing at nothing.
   */
  prices: Record<number, number>;
  /**
   * What a sale actually fetches, by typeId: the hub's highest buy where it has
   * one, and its lowest sell where it does not.
   *
   * Merged rather than kept separate so a type with sell orders but no buy
   * order stays priceable — it is not instantly sellable, which is a different
   * thing from unpriceable, and refusing to cost a chain over it would lose
   * every candidate that touches a thin market.
   */
  revenuePrices: Record<number, number>;
  /**
   * Every *other* authenticated Character's colonies, already turned into
   * advice — the material for a plan that spans alts.
   *
   * Cache-only (`roster.ts`), so a Character whose colonies were never loaded
   * simply is not here. Kept out of `systems` and off the cards deliberately:
   * these planets are not the active Character's to rebuild, and a card
   * offering to remove a pin on somebody else's colony would be advice aimed
   * at the wrong pilot. They exist to be *routed from*.
   */
  altAdvice: PlanetAdvice[];
  /** Each alt colony's customs rate, by planetId. */
  altTaxRates: Map<number, number>;
  /** Who owns each alt colony, by planetId — for naming a route's other end. */
  altOwners: Map<number, string>;
}

async function loadAdvisorSnapshot(characterId: number): Promise<Snapshot> {
  const nowMs = Date.now();
  // Started here rather than awaited where it's used: it needs only
  // `characterId`, so it runs alongside everything else below instead of
  // after it — one fewer serialized round trip before first paint.
  const rosterPromise = loadPiRosterSnapshot(characterId);
  const [pi, planetRadiusRaw, { cached, needsReauth }, ccLevel, customsSkill, consolidation] =
    await Promise.all([
      loadPi(),
      // Its own payload, and a big one, so a failure here must not take the tab
      // down: an unresolved radius leaves that colony's link cost unknown, which
      // the card already knows how to say.
      loadPiPlanetRadius().catch(() => ({}) as Record<string, number>),
      loadCharacterPlanets(characterId),
      loadCommandCenterUpgrades(characterId, nowMs),
      // Null is a real answer — no skill data at all — and stays distinct from a
      // trained zero, so `customsRateSource` can say which it is.
      loadCustomsCodeExpertise(characterId, nowMs).catch(() => null),
      // Same null-is-an-answer rule: a pilot whose /skills never loaded is not
      // a pilot with one colony, and `planetSlots` keeps the two apart.
      loadInterplanetaryConsolidation(characterId, nowMs).catch(() => null),
    ]);
  const colonies = cached?.data ?? [];

  const bySystem = new Map<number, CharacterPlanet[]>();
  for (const colony of colonies) {
    const list = bySystem.get(colony.solar_system_id) ?? [];
    list.push(colony);
    bySystem.set(colony.solar_system_id, list);
  }
  const systemIds = [...bySystem.keys()];

  // Started here rather than awaited in sequence below: it needs only `pi`,
  // which is already in hand, so it runs alongside the colony detail and the
  // per-planet lookups instead of after them. It is the widest read on this
  // tab — every planetary commodity there is — and nothing between here and
  // the await depends on it.
  const pricesPromise = loadPlanPrices(DEFAULT_TRADE_HUB, [
    ...new Set([...pi.raw.map((resource) => resource.typeID), ...plannableTypeIds(pi)]),
  ])
    // Failure is not fatal: an unpriced candidate refuses with `needs-price`
    // rather than taking the whole panel down with it.
    .then((result) => ({
      prices: result.prices,
      revenuePrices: { ...result.prices, ...result.buyPrices },
    }))
    .catch(() => ({ prices: {}, revenuePrices: {} }));

  const [details, systemNames, planetIdLists, securities] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      colonies.map((colony) => colony.planet_id)
    ),
    Promise.all(systemIds.map((systemId) => loadSystemName(systemId))),
    Promise.all(systemIds.map((systemId) => loadSystemPlanetIds(systemId))),
    Promise.all(systemIds.map((systemId) => loadSystemSecurity(systemId).catch(() => null))),
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

  // The character's own rows only. The ranking is account-wide and fanned out
  // one row per Character (round 7), so reading this Character's rows reads
  // the account's ranking.
  const richness = new Map<number, number[]>(
    (await db.planetRichness.where('characterId').equals(characterId).toArray()).map((row) => [
      row.planetId,
      row.order,
    ])
  );

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
  const [schematicNameList, typeNames, prices] = await Promise.all([
    Promise.all(schematicIds.map((id) => loadSchematicName(id))),
    loadTypeNames(productTypeIds),
    pricesPromise,
  ]);
  const schematicNames = new Map<number, string>();
  schematicIds.forEach((id, i) => {
    const name = schematicNameList[i];
    if (name) schematicNames.set(id, name);
  });

  const planetRadiusKm = new Map(
    Object.entries(planetRadiusRaw).map(([planetId, km]) => [Number(planetId), km])
  );

  // Other Characters' colonies. Cache-only and therefore cheap: page open
  // costs no extra ESI here, and a Character whose colonies have never been
  // read contributes nothing rather than an empty-looking one.
  const roster = await rosterPromise;
  const altAdvice: PlanetAdvice[] = [];
  const altTaxRates = new Map<number, number>();
  const altOwners = new Map<number, string>();
  if (roster.colonies.length > 0) {
    const altBySystem = new Map<number, typeof roster.colonies>();
    for (const entry of roster.colonies) {
      const list = altBySystem.get(entry.planet.solar_system_id) ?? [];
      list.push(entry);
      altBySystem.set(entry.planet.solar_system_id, list);
      altOwners.set(entry.planet.planet_id, entry.characterName);
    }
    const altSystemIds = [...altBySystem.keys()];
    // Cache-only: this system is only known because an alt has a colony
    // there, and looking up its security must not itself spend ESI the
    // active Character's own page load never asked for.
    const altSecurities = await Promise.all(
      altSystemIds.map((systemId) => readCachedSystemSecurity(systemId).catch(() => null))
    );
    const altDetails = new Map<number, CharacterPlanetDetail>();
    for (const entry of roster.colonies) {
      if (entry.detail) altDetails.set(entry.planet.planet_id, entry.detail);
    }
    altSystemIds.forEach((systemId, i) => {
      const entries = altBySystem.get(systemId) ?? [];
      // Only the alt's own colonies, not the whole system: this is material to
      // route from, not a system the active Character is being advised about.
      const planets: SystemPlanet[] = entries.map((entry) => ({
        planetId: entry.planet.planet_id,
        name: planetInfo.get(entry.planet.planet_id)?.name ?? null,
        typeId: planetInfo.get(entry.planet.planet_id)?.typeId ?? null,
      }));
      const space = colonySpaceFor(altSecurities[i]);
      // `null` skill, not the active Character's: Customs Code Expertise is
      // trained per Character and the roster never reads an alt's skills. The
      // un-reduced rate understates the margin, which is the safe direction,
      // and `customsRateSource` already has a name for not knowing.
      const rate = defaultCustomsRate(space, null);
      for (const entry of entries) altTaxRates.set(entry.planet.planet_id, rate);
      altAdvice.push(
        ...systemAdvice(
          {
            planets,
            colonies: entries.map((entry) => entry.planet),
            details: altDetails,
            planetRadiusKm,
          },
          pi
        )
      );
    });
  }

  return {
    pi,
    altAdvice,
    altTaxRates,
    altOwners,
    systems: systemIds.map((systemId, i) => {
      const space = colonySpaceFor(securities[i]);
      return {
        systemId,
        name: systemNames[i],
        colonies: bySystem.get(systemId) ?? [],
        customsRate: defaultCustomsRate(space, customsSkill),
        customsSource: customsRateSource(space, customsSkill),
      };
    }),
    details: flatDetails,
    planetsBySystem,
    ceiling: maxColonyBudget(ccLevel, pi),
    slots: planetSlots(consolidation),
    // Every colony, not `bySystem.get(activeSystem)`: the cap is on the
    // character.
    colonyCount: colonies.length,
    needsReauth,
    schematicNames,
    typeNames,
    richness,
    prices: prices.prices,
    revenuePrices: prices.revenuePrices,
    planetRadiusKm,
  };
}

/** One shared empty array, so a card with no opportunity keeps a stable prop. */
const EMPTY_OPPORTUNITIES: readonly NetworkOpportunity[] = [];
const EMPTY_CONVERSIONS: readonly NetworkConversion[] = [];
const EMPTY_ADVICE: PlanetAdvice[] = [];

/**
 * The card shell every planet card shares: name, planet type, a body, and an
 * optional footer holding the capacity read and the Details affordance.
 */
function PlanetCard({
  planetId,
  name,
  planetType,
  dashed = false,
  dim = false,
  footer,
  children,
}: {
  planetId: number;
  name: string | null;
  planetType: PlanetType | null;
  dashed?: boolean;
  dim?: boolean;
  footer?: React.ReactNode;
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
      {footer && (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-panel-2 px-3 py-1.5">
          {footer}
        </div>
      )}
    </div>
  );
}

/** The card footer's Details control, which opens the tab's one modal. */
function DetailsButton({ name, onClick }: { name: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('piAdvisor.detailsLabel', { name })}
      aria-haspopup="dialog"
      className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-xs border border-line-bright px-2 text-[0.6875rem] font-semibold tracking-wide text-accent uppercase hover:border-accent-dim hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {t('piAdvisor.detailsAction')}
      <svg
        aria-hidden="true"
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </button>
  );
}

/** A colony's build-up-to recommendation, memoised for one colony. */
function useStopTier(
  advice: Extract<PlanetAdvice, { kind: 'built' }>,
  pi: PiData,
  prices: Readonly<Record<number, number>>,
  revenuePrices: Readonly<Record<number, number>>,
  taxRate: number
) {
  return useMemo(
    () =>
      colonyStopTierAdvice({
        colony: advice.colony,
        planetType: advice.planetType,
        pi,
        prices,
        revenuePrices,
        taxRate,
      }),
    [advice.colony, advice.planetType, pi, prices, revenuePrices, taxRate]
  );
}

interface ColonyCardProps {
  advice: Extract<PlanetAdvice, { kind: 'built' }>;
  pi: PiData;
  schematicNames: ReadonlyMap<number, string>;
  typeNames: ReadonlyMap<number, string>;
  prices: Readonly<Record<number, number>>;
  /** What a sale fetches — highest hub buy, falling back to the ask. */
  revenuePrices: Readonly<Record<number, number>>;
  taxRate: number;
  /** The pilot's Command Center Upgrades ceiling, for spotting a colony behind it. */
  ceiling: MaxColonyBudget;
  /**
   * The network plan's lines placed on *this* planet. Passed in rather than
   * computed here because material is shared across the set: a card that
   * planned its own would promise the same Water to five different planets.
   */
  opportunities: readonly NetworkOpportunity[];
  /** Exchanges the plan found on this planet: what to take down for what. */
  conversions: readonly NetworkConversion[];
  planetNames: ReadonlyMap<number, string>;
  /** Who owns a planet, when it is not this Character's — by planetId. */
  owners: ReadonlyMap<number, string>;
}

/**
 * A built colony, at a glance: what it runs, how full it is, and the two
 * things worth doing about it. Everything else is behind Details.
 */
function BuiltCard({ onOpenDetails, ...props }: ColonyCardProps & { onOpenDetails: () => void }) {
  const { t } = useTranslation();
  const { advice, pi, typeNames, prices, revenuePrices, taxRate, opportunities, conversions } =
    props;
  const { colony } = advice;
  const plan = useColonyPlan(colony, pi);
  const stopTier = useStopTier(advice, pi, prices, revenuePrices, taxRate);
  const name = advice.name ?? t('pi.planetLabel', { id: advice.planetId });

  // A colony whose links cannot be costed gets no instructions at all — the
  // same rule the unbuilt cards follow: name what is true, print no number
  // that isn't.
  const unmeasurable = colony.linkCount > 0 && colony.pinLoad.linkLoad === null;

  return (
    <PlanetCard
      planetId={advice.planetId}
      name={advice.name}
      planetType={advice.planetType}
      footer={
        <>
          <span className="text-[0.6875rem] text-text-faint tabular-nums">
            {t('piAdvisor.freeFootnote', {
              cpu: Math.round(plan.spare.cpu).toLocaleString(),
              powergrid: Math.round(plan.spare.powergrid).toLocaleString(),
            })}
          </span>
          <DetailsButton name={name} onClick={onOpenDetails} />
        </>
      }
    >
      <>
        {!colony.detailLoaded && (
          <p className="text-xs text-warning">{t('piAdvisor.detailUnavailable')}</p>
        )}

        {/* What it runs, as two aligned rows rather than two labelled lists. */}
        <dl className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2.5 gap-y-1 text-xs">
          {colony.extractedPerHour.slice(0, 2).map((line, index) => (
            <div key={line.typeId} className="contents">
              <dt>
                {index === 0 ? <SectionLabel>{t('piAdvisor.extractsLabel')}</SectionLabel> : null}
              </dt>
              <dd className="m-0 min-w-0 truncate">
                {typeNames.get(line.typeId) ?? t('pi.unknownProduct')}
              </dd>
              <dd className="m-0 text-right text-text-dim tabular-nums">
                {t('piAdvisor.unitsPerHour', {
                  units: Math.round(line.unitsPerHour).toLocaleString(),
                })}
              </dd>
            </div>
          ))}
          {colony.production.slice(0, 2).map((group, index) => (
            <div key={String(group.schematicId)} className="contents">
              <dt>
                {index === 0 ? <SectionLabel>{t('piAdvisor.makesLabel')}</SectionLabel> : null}
              </dt>
              <dd className="m-0 min-w-0 truncate">
                {group.schematicId !== undefined
                  ? (props.schematicNames.get(group.schematicId) ?? t('pi.unknownSchematic'))
                  : t('pi.unknownSchematic')}
              </dd>
              <dd className="m-0 text-right text-text-dim tabular-nums">
                {t('piAdvisor.facilityCount', { count: group.count })}
              </dd>
            </div>
          ))}
        </dl>

        {colony.detailLoaded && colony.extractedPerHour.length === 0 && (
          <p className="text-xs text-text-dim">{t('piAdvisor.noMeasuredExtraction')}</p>
        )}

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
          <LoadMeter
            label={t('piAdvisor.cpu')}
            used={colony.pinLoad.load.cpu}
            budget={plan.budget.cpu}
          />
          <LoadMeter
            label={t('piAdvisor.powergrid')}
            used={colony.pinLoad.load.powergrid}
            budget={plan.budget.powergrid}
          />
        </div>

        <div className="space-y-2 border-t border-line pt-2.5">
          <SectionLabel>{t('piAdvisor.actionsLabel')}</SectionLabel>
          {unmeasurable ? (
            <p className="text-[0.6875rem] text-text-dim">
              {t('piAdvisor.roomUnknownRadius', { count: colony.linkCount })}
            </p>
          ) : (
            <ColonyDirectives
              idle={plan.idle}
              pi={pi}
              opportunities={opportunities}
              conversions={conversions}
              planetNames={props.planetNames}
              owners={props.owners}
            />
          )}
        </div>

        <div className="mt-auto space-y-2 border-t border-line pt-2.5">
          <SectionLabel>{t('piAdvisor.stopTierLabel')}</SectionLabel>
          <StopTierRow result={stopTier} extractedPerHour={colony.extractedPerHour} />
        </div>
      </>
    </PlanetCard>
  );
}

/**
 * A planet with no colony on it.
 *
 * Two states, and only two. With no colony slot free the card is *nothing but*
 * the training message: a resource picker, an estimate and a Details button
 * are all advice a pilot cannot act on until a slot frees up, and offering
 * them under a "you cannot build here" banner is what made this card noise.
 *
 * With a slot free it is a question and an answer — tick what you would pull,
 * and `unbuiltPlanModel` sizes a colony around exactly that.
 */
function UnbuiltCard({
  advice,
  picked,
  rate,
  pi,
  ceiling,
  assumedLinkCost,
  prices,
  revenuePrices,
  taxRate,
  onPickedChange,
  slots,
  colonyCount,
}: {
  advice: Extract<PlanetAdvice, { kind: 'unbuilt' }>;
  picked: readonly number[];
  rate: AssumedRate;
  pi: PiData;
  ceiling: MaxColonyBudget;
  /** The hop borrowed from the pilot's own colonies; null when none could be measured. */
  assumedLinkCost: PinLoad | null;
  prices: Readonly<Record<number, number>>;
  /** What a sale fetches — highest hub buy, falling back to the ask. */
  revenuePrices: Readonly<Record<number, number>>;
  taxRate: number;
  onPickedChange: (planetId: number, picked: number[]) => void;
  slots: PlanetSlots;
  colonyCount: number;
}) {
  const { t } = useTranslation();
  // Never off an assumed cap. `planetSlots(null)` is one slot, and read as
  // fact it tells a pilot at Interplanetary Consolidation V — five free slots
  // — to abandon a colony. Same rule the Command Center ceiling follows: an
  // assumed figure may be shown, never acted on.
  const noSlotFree = !slots.assumed && colonyCount >= slots.slots;
  const localResources = advice.localResources.map((resource) => resource.typeID);
  const nameByType = new Map(advice.localResources.map((r) => [r.typeID, r.name]));

  const plan = useMemo(
    () =>
      unbuiltPlanAdvice({
        planetType: advice.planetType,
        picked,
        pi,
        ceiling,
        rate,
        assumedLinkCost,
        prices,
        revenuePrices,
        taxRate,
      }),
    [advice.planetType, picked, pi, ceiling, rate, assumedLinkCost, prices, revenuePrices, taxRate]
  );

  // The whole card, when there is nowhere to put a Command Center.
  if (noSlotFree) {
    return (
      <PlanetCard
        planetId={advice.planetId}
        name={advice.name}
        planetType={advice.planetType}
        dashed
        dim
      >
        <p className="text-xs text-warning">
          {slots.slots >= PLANET_SLOTS_MAX
            ? t('piAdvisor.noSlotFreeMax', { total: slots.slots })
            : t('piAdvisor.noSlotFree', {
                used: colonyCount,
                total: slots.slots,
                level: slots.slots,
              })}
        </p>
      </PlanetCard>
    );
  }

  return (
    <PlanetCard
      planetId={advice.planetId}
      name={advice.name}
      planetType={advice.planetType}
      dashed
      footer={
        <span className="text-[0.6875rem] text-text-faint">
          {plan.status === 'advised' ? t('piAdvisor.projectedFrom') : t('piAdvisor.notColonised')}
        </span>
      }
    >
      <>
        {/*
          Stated on every unbuilt card, not only when the allowance runs out.
          Six planets in a system against five colonies is not "you cannot
          build" — it is "you can build one of these, not both".
        */}
        {!slots.assumed && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piAdvisor.slotsFree', {
              count: Math.max(0, slots.slots - colonyCount),
              total: slots.slots,
            })}
          </p>
        )}

        <div className="space-y-1.5">
          <SectionLabel>{t('piAdvisor.pickLabel')}</SectionLabel>
          <ResourcePicker
            localResources={localResources}
            picked={picked}
            resourceName={(typeId) => nameByType.get(typeId) ?? String(typeId)}
            onChange={(next) => onPickedChange(advice.planetId, next)}
          />
        </div>

        <div className="mt-auto space-y-2 border-t border-line pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>{t('piAdvisor.actionsLabel')}</SectionLabel>
            {plan.status === 'advised' && <EstimateBadge />}
          </div>
          <UnbuiltPlanLines plan={plan} />
        </div>
      </>
    </PlanetCard>
  );
}

/**
 * The unbuilt plan, or the one input that stops it.
 *
 * Every refusal names what is missing rather than printing a figure with a
 * caveat beside it — the rule the whole tab follows. A caveat is easy to miss;
 * an absent number is not.
 */
function UnbuiltPlanLines({ plan }: { plan: UnbuiltPlanAdvice }) {
  const { t } = useTranslation();
  if (plan.status !== 'advised') {
    return (
      <p className="text-[0.6875rem] text-text-dim">{t(`piAdvisor.buildPlan.${plan.status}`)}</p>
    );
  }
  if (plan.advice.kind === 'nothing-to-score') {
    return <p className="text-[0.6875rem] text-text-dim">{t('piAdvisor.buildPlan.needs-pick')}</p>;
  }
  if (plan.advice.kind === 'no-recommendation') {
    return (
      <p className="text-[0.6875rem] text-text-dim">
        {t(`piAdvisor.stopTierBlocked.${plan.advice.blocker}`)}
      </p>
    );
  }
  const { best } = plan.advice;
  return (
    <div className="space-y-1.5">
      <DirectiveRow
        verb="build"
        value={t('piAdvisor.aboutValue', { isk: formatIsk(best.marginPerHour) })}
        unit={t('piAdvisor.perHourUnit')}
      >
        {best.tier === 0
          ? t('piAdvisor.directiveBuildRaw', { name: best.name })
          : t('piAdvisor.directiveBuildMake', { name: best.name, tier: best.tier })}
      </DirectiveRow>
      <p className="text-[0.6875rem] text-text-faint">
        {t('piAdvisor.buildPlanBasis', {
          units: Math.round(best.unitsPerHour).toLocaleString(),
        })}
      </p>
    </div>
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

/**
 * The modal's contents for one colony.
 *
 * Its own component so the derivations can be hooks: `AdvisorPanel` renders
 * the cards in a `map`, where `useColonyPlan` could not be called, and the
 * modal needs the same plan the card is showing.
 */
function ColonyDetailBody({
  advice,
  pi,
  schematicNames,
  typeNames,
  prices,
  revenuePrices,
  taxRate,
  ceiling,
  opportunities,
  conversions,
  planetNames,
  owners,
}: ColonyCardProps) {
  const plan = useColonyPlan(advice.colony, pi);
  const stopTier = useStopTier(advice, pi, prices, revenuePrices, taxRate);
  return (
    <ColonyDetail
      advice={advice}
      plan={plan}
      pi={pi}
      schematicNames={schematicNames}
      typeNames={typeNames}
      stopTier={stopTier}
      ceiling={ceiling}
      opportunities={opportunities}
      conversions={conversions}
      planetNames={planetNames}
      owners={owners}
    />
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
  // Off by default: buying planetary inputs assumes a hub within reach, which
  // is a fact about the pilot rather than about any colony.
  const buyInputs = useMarketSourcing((state) => state.value);
  const hydrateBuyInputs = useMarketSourcing((state) => state.hydrate);
  const setBuyInputs = useMarketSourcing((state) => state.setValue);
  const withAlts = useAltColonies((state) => state.value);
  const hydrateAlts = useAltColonies((state) => state.hydrate);
  const setWithAlts = useAltColonies((state) => state.setValue);
  useEffect(() => {
    void hydrateAlts();
  }, [hydrateAlts]);
  useEffect(() => {
    void hydrateBuyInputs();
  }, [hydrateBuyInputs]);
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

  // Which planet's detail modal is open. One `<Modal>` for the whole tab with
  // the planet in state, never one per card: eight mounted `<dialog>`
  // elements, each with its own focus-restore effect, is both wasteful and a
  // source of focus bugs.
  const [openPlanetId, setOpenPlanetId] = useState<number | null>(null);

  // Edits made since the snapshot loaded, layered over it rather than copied
  // into their own state. Copying would mean a `setState` in an effect keyed
  // on the snapshot (which `PlanPanel` avoids for the same reason) and would
  // silently drop an edit made while a reload was in flight. Layering keeps
  // the picker repainting immediately — ticking a resource re-sizes the build
  // plan without a page reload — with no second source of truth.
  const [edits, setEdits] = useState<ReadonlyMap<number, number[]>>(EMPTY_RICHNESS);
  const picks = useMemo(() => {
    const merged = new Map(snapshot?.richness ?? EMPTY_RICHNESS);
    for (const [planetId, picked] of edits) {
      if (picked.length === 0) merged.delete(planetId);
      else merged.set(planetId, picked);
    }
    return merged;
  }, [snapshot, edits]);

  const handlePickedChange = useCallback((planetId: number, picked: number[]) => {
    // An empty pick is kept as an explicit empty entry, not deleted: it has to
    // out-rank whatever the snapshot still holds, or clearing the picks would
    // immediately fall back to the stored ones.
    setEdits((current) => new Map(current).set(planetId, picked));
    // Fire-and-forget, like every other Editable Data write here: the layer
    // above is what the card renders, and a failed write must not take the
    // panel down.
    void (picked.length === 0
      ? clearPlanetRichness(planetId)
      : setPlanetRichness(planetId, picked));
  }, []);

  const advice = useMemo(() => {
    if (!snapshot || !activeSystem) return [];
    return systemAdvice(
      {
        planets: snapshot.planetsBySystem.get(activeSystem.systemId) ?? [],
        colonies: activeSystem.colonies,
        details: snapshot.details,
        planetRadiusKm: snapshot.planetRadiusKm,
      },
      snapshot.pi
    );
  }, [snapshot, activeSystem]);

  /**
   * The rate every unbuilt estimate is projected at: the mean of what this
   * character's own extractors are measurably sustaining, across every system
   * — not this system alone, since a bigger sample is a better assumption and
   * an extractor's rate is a property of its program, not its neighbourhood.
   */
  const assumedRate = useMemo(() => {
    const measured = advice.flatMap((entry) =>
      entry.kind === 'built' ? entry.colony.extractedPerHour : []
    );
    return assumedExtractionRate(measured);
  }, [advice]);

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

  // Every system the character has a colony in, because combining is exactly
  // the thing one planet cannot do alone — and there is no reason the other
  // planet has to be in the same system. Only the *host's* customs office
  // enters a chain's cost (`chain.ts`), so spanning systems needs the rate per
  // planet rather than a second tax model.
  const networkAdvice = snapshot.systems.flatMap((system) =>
    systemAdvice(
      {
        planets: snapshot.planetsBySystem.get(system.systemId) ?? [],
        colonies: system.colonies,
        details: snapshot.details,
        planetRadiusKm: snapshot.planetRadiusKm,
      },
      snapshot.pi
    )
  );
  /**
   * The link cost an unbuilt planet's build plan is fitted against: the median
   * hop across this character's own colonies.
   *
   * Borrowed, never invented. A planet with no colony has no geometry to price
   * a link from, and fitting one at zero would overstate what fits by exactly
   * the amount #440 was filed about — so with no colony to measure,
   * `unbuiltPlanAdvice` refuses instead. See
   * `docs/context/decisions/` for the scope decision this rests on.
   */
  const assumedLinkCost = medianNewLinkLoad(
    networkAdvice.flatMap((entry) =>
      entry.kind === 'built' && entry.colony.pinLoad.newLinkLoad
        ? [entry.colony.pinLoad.newLinkLoad]
        : []
    )
  );

  const taxRateByPlanet = new Map<number, number>();
  for (const system of snapshot.systems) {
    for (const colony of system.colonies) {
      taxRateByPlanet.set(colony.planet_id, system.customsRate);
    }
  }
  // The alts join the *plan*, never the cards: those planets are not this
  // Character's to rebuild, and a card offering to pull a pin off somebody
  // else's colony would be advice aimed at the wrong pilot.
  const altsInPlan = withAlts ? snapshot.altAdvice : EMPTY_ADVICE;
  for (const [planetId, rate] of snapshot.altTaxRates) taxRateByPlanet.set(planetId, rate);
  const planColonies = withAlts ? [...networkAdvice, ...altsInPlan] : networkAdvice;
  const altsPlanned = altsInPlan.filter((entry) => entry.kind === 'built').length;

  const builtCount = advice.filter((entry) => entry.kind === 'built').length;
  // What these colonies could do together — the answer no single card can
  // give, because each one is about its own planet.
  //
  // Not memoised, deliberately: this sits below the reauth and empty-state
  // returns above, so a `useMemo` here is a conditionally-called hook. The
  // fix is to lift the early returns into a wrapper, which is a bigger change
  // than this walk is worth — it is one pass over the payload's schematics
  // against a handful of colonies.
  const network = colonyNetwork({
    advice: planColonies,
    pi: snapshot.pi,
    prices: snapshot.prices,
    revenuePrices: snapshot.revenuePrices,
    allowMarketSourcing: buyInputs,
    taxRateByPlanet,
    taxRate: activeSystem.customsRate,
  });
  // Grouped once rather than filtered per card: the plan is one pass over a
  // handful of colonies, but a filter inside the render loop is a scan of the
  // whole plan for every planet on screen, including the ones it never placed
  // anything on.
  const opportunitiesByHost = new Map<number, NetworkOpportunity[]>();
  for (const line of network?.plan.opportunities ?? []) {
    const forHost = opportunitiesByHost.get(line.hostPlanetId);
    if (forHost) forHost.push(line);
    else opportunitiesByHost.set(line.hostPlanetId, [line]);
  }
  const conversionsByHost = new Map<number, NetworkConversion[]>();
  for (const entry of network?.plan.conversions ?? []) {
    const here = conversionsByHost.get(entry.planetId);
    if (here) here.push(entry);
    else conversionsByHost.set(entry.planetId, [entry]);
  }
  const planetNames = new Map(
    [...networkAdvice, ...snapshot.altAdvice]
      .filter((entry) => entry.name !== null)
      .map((entry) => [entry.planetId, entry.name as string])
  );
  const openColony =
    advice.find(
      (entry): entry is Extract<PlanetAdvice, { kind: 'built' }> =>
        entry.kind === 'built' && entry.planetId === openPlanetId
    ) ?? null;
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

  // Same two readings as the ceiling above: a trained level is a fact, an
  // untrained assumption is not, and only the first may be shown bare.
  const slotsNumbers = t('piAdvisor.slotsValue', {
    used: snapshot.colonyCount,
    total: snapshot.slots.slots,
  });
  const slotsChipValue = snapshot.slots.assumed
    ? t('piAdvisor.slotsAssumed', { value: slotsNumbers })
    : slotsNumbers;

  return (
    <div className="space-y-3">
      <Panel title={t('piAdvisor.controlsTitle')}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('piAdvisor.system')}
            </span>
            <Select
              value={String(activeSystem.systemId)}
              onValueChange={(value) => onSystemIdChange(Number(value))}
            >
              <SelectTrigger aria-label={t('piAdvisor.system')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {systems.map((system) => (
                  <SelectItem key={system.systemId} value={String(system.systemId)}>
                    {system.name ?? t('piAdvisor.systemLabel', { id: system.systemId })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              tooltip={t('piAdvisor.colonisedTooltip')}
            />
            {/*
              The chip above counts planets in *this system*; this one counts
              the character's colony allowance, which is what the one above
              was being read as. They are next to each other on purpose —
              seeing "1 / 2 planets" beside "4 / 5 used" is what makes the
              difference obvious.
            */}
            <StatChip
              label={t('piAdvisor.slots')}
              value={slotsChipValue}
              tooltip={
                snapshot.slots.assumed
                  ? t('piAdvisor.slotsAssumedTooltip')
                  : t('piAdvisor.slotsTooltip')
              }
              tone={
                snapshot.slots.assumed
                  ? 'warning'
                  : snapshot.colonyCount >= snapshot.slots.slots
                    ? 'accent'
                    : undefined
              }
            />
            {/* Derived, so it says so: a derived number that does not reads as measured. */}
            <StatChip
              label={t('piAdvisor.customsRate')}
              value={t('piAdvisor.customsRateValue', {
                percent: customsRatePercent(activeSystem.customsRate),
              })}
              tooltip={customsTooltip(activeSystem.customsSource, t)}
              tone={
                activeSystem.customsSource.kind === 'highsec-unknown-skill' ? 'warning' : undefined
              }
            />
          </div>
          {/*
            A fact about the pilot, not about a planet — so one switch for the
            tab rather than a control on every card. Off by default: buying P1
            to feed a factory is a good strategy that assumes a hub within
            reach, and the Advisor should not price a standing freight run
            nobody agreed to.
          */}
          <label className="mt-3 flex items-start gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={buyInputs}
              onChange={() => void setBuyInputs(!buyInputs)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
            />
            <span>
              <span className="font-medium">{t('piAdvisor.buyInputsLabel')}</span>
              <span className="block text-[0.6875rem] text-text-dim">
                {t('piAdvisor.buyInputsHint', { hub: DEFAULT_TRADE_HUB.systemName })}
              </span>
            </span>
          </label>
          {/*
            Its own switch rather than the Colonies panel's: that one is
            ephemeral `useState` on another tab and answers "show me", where
            this answers "plan with". Only offered when there is something to
            plan with — a pilot with one Character should not be handed a
            control that can do nothing.
          */}
          {snapshot.altAdvice.length > 0 && (
            <label className="mt-2 flex items-start gap-2 text-xs text-text">
              <input
                type="checkbox"
                checked={withAlts}
                onChange={() => void setWithAlts(!withAlts)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
              />
              <span>
                <span className="font-medium">{t('piAdvisor.altColoniesLabel')}</span>
                <span className="block text-[0.6875rem] text-text-dim">
                  {withAlts && altsPlanned > 0
                    ? t('piAdvisor.altColoniesCount', { count: altsPlanned })
                    : t('piAdvisor.altColoniesHint')}
                </span>
              </span>
            </label>
          )}
        </div>
      </Panel>

      {network && (
        <NetworkPanel
          plan={network.plan}
          buyInputs={buyInputs}
          assumesRemoval={network.assumesRemoval}
          planetNames={planetNames}
          taxRate={activeSystem.customsRate}
          taxRateByPlanet={taxRateByPlanet}
        />
      )}

      {advice.length === 0 ? (
        <EmptyState title={t('piAdvisor.noPlanetsTitle')} hint={t('piAdvisor.noPlanetsHint')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {advice.map((entry) =>
            entry.kind === 'built' ? (
              <BuiltCard
                key={entry.planetId}
                onOpenDetails={() => setOpenPlanetId(entry.planetId)}
                advice={entry}
                pi={snapshot.pi}
                schematicNames={snapshot.schematicNames}
                typeNames={snapshot.typeNames}
                prices={snapshot.prices}
                revenuePrices={snapshot.revenuePrices}
                taxRate={activeSystem.customsRate}
                ceiling={snapshot.ceiling}
                opportunities={opportunitiesByHost.get(entry.planetId) ?? EMPTY_OPPORTUNITIES}
                conversions={conversionsByHost.get(entry.planetId) ?? EMPTY_CONVERSIONS}
                planetNames={planetNames}
                owners={snapshot.altOwners}
              />
            ) : entry.kind === 'unbuilt' ? (
              <UnbuiltCard
                key={entry.planetId}
                advice={entry}
                picked={picks.get(entry.planetId) ?? EMPTY_ORDER}
                rate={assumedRate}
                pi={snapshot.pi}
                ceiling={snapshot.ceiling}
                assumedLinkCost={assumedLinkCost}
                prices={snapshot.prices}
                revenuePrices={snapshot.revenuePrices}
                taxRate={activeSystem.customsRate}
                onPickedChange={handlePickedChange}
                slots={snapshot.slots}
                colonyCount={snapshot.colonyCount}
              />
            ) : entry.kind === 'unknown-type' ? (
              <UnknownTypeCard key={entry.planetId} advice={entry} />
            ) : (
              <UncolonisableCard key={entry.planetId} advice={entry} />
            )
          )}
        </div>
      )}

      {/*
        One dialog for the tab. `openColony` is looked up rather than stored,
        so a refresh that reshapes the snapshot cannot leave a stale colony on
        screen — the modal simply closes.
      */}
      <Modal
        open={openColony !== null}
        onClose={() => setOpenPlanetId(null)}
        placement="wide"
        title={
          openColony
            ? t('piAdvisor.detailTitle', {
                name: openColony.name ?? t('pi.planetLabel', { id: openColony.planetId }),
                type: t(`pi.planetType.${openColony.planetType}`),
                level: openColony.colony.upgradeLevel,
              })
            : ''
        }
      >
        {openColony && (
          <ColonyDetailBody
            advice={openColony}
            pi={snapshot.pi}
            schematicNames={snapshot.schematicNames}
            typeNames={snapshot.typeNames}
            prices={snapshot.prices}
            revenuePrices={snapshot.revenuePrices}
            taxRate={activeSystem.customsRate}
            ceiling={snapshot.ceiling}
            opportunities={opportunitiesByHost.get(openColony.planetId) ?? EMPTY_OPPORTUNITIES}
            conversions={conversionsByHost.get(openColony.planetId) ?? EMPTY_CONVERSIONS}
            planetNames={planetNames}
            owners={snapshot.altOwners}
          />
        )}
      </Modal>
    </div>
  );
}
