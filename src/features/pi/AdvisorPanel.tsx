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
import { EmptyState, Panel, ReauthBanner, Modal, Spinner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { formatIsk } from '@/lib/isk';
import { loadPi, loadPiPlanetRadius } from '@/sde/loadSde';
import { db } from '@/db';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadPlanPrices } from './planPrices';
import { clearPlanetRichness, scheduleSync, setPlanetRichness, setSyncedSetting } from '@/sync';
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
import { PI_CADENCE_DAYS, cadenceHours, useCadence } from './cadencePref';
import { HowYouPlay } from './HowYouPlay';
import { restartCadenceYield } from '@/engine/pi/restartCadence';
import { Worklist, WorklistToggle } from './Worklist';
import { buildWorklist } from './worklistModel';
import { worklistColonies } from './worklistAdapter';
import { BlindSpots } from './BlindSpots';
import { blindSpots } from './blindSpotModel';
import { AdvisorSummary } from './AdvisorSummary';
import { ColonyStrip } from './ColonyStrip';
import { colonyStripRows } from './colonyStripModel';
import { builtColonyEarnings, totalColonyEarnings } from './colonyEarningsModel';
import { extractorProgramsFromPins } from './adapters';
import { colonyNetwork } from './networkModel';
import { NetworkPanel } from './NetworkPanel';
import { ColonyDetail } from './ColonyDetailModal';
import { colonyPlan, layoutLabel, useColonyPlan } from './colonyPlan';
import { DirectiveRow, EstimateBadge, SectionLabel } from './DirectiveRow';
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
import {
  customsRateFor,
  parseCustomsOverrides,
  withCustomsOverride,
  withoutCustomsOverride,
  SYNCED_PI_CUSTOMS_KEY,
  type CustomsOverrides,
} from './customsOverride';

/** Stable identities, so an unranked planet's card does not remount every render. */
const EMPTY_ORDER: readonly number[] = [];
const EMPTY_RICHNESS: ReadonlyMap<number, number[]> = new Map();
const EMPTY_CUSTOMS: CustomsOverrides = {};

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
  /**
   * The pilot's own customs rates by systemId — Editable Data, so it arrives
   * from Dexie wherever a sync last put it. Layered over in the component so
   * an edit repaints without a reload.
   */
  customsOverrides: CustomsOverrides;
  /** Planet radius in km by planetId, for costing links (#440). */
  planetRadiusKm: Map<number, number>;
  /**
   * Hub prices for every planetary commodity there is — every P0 and every
   * schematic output. One call for the whole payload, not one per card: the
   * set is fixed at about eighty types whatever the character owns, so this is
   * a constant, not a fan-out that grows with the system. A type the hub does
   * not quote is absent, never zero — `recommendStopTier` refuses rather than
   * pricing at nothing.
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

async function loadAdvisorSnapshot(characterId: number, priceHub: TradeHub): Promise<Snapshot> {
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
  const pricesPromise = loadPlanPrices(priceHub, [
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

  // Whatever a sync last wrote, validated: this blob is not necessarily
  // written by this version of the app.
  const customsOverrides = parseCustomsOverrides(
    (await db.settings.get(SYNCED_PI_CUSTOMS_KEY).catch(() => undefined))?.value
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
    customsOverrides,
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

/** A colony's build-up-to recommendation, memoised for one colony. */
function useStopTier(
  advice: Extract<PlanetAdvice, { kind: 'built' }>,
  pi: PiData,
  prices: Readonly<Record<number, number>>,
  revenuePrices: Readonly<Record<number, number>>,
  taxRate: number
) {
  // The pilot's own haul window, not a constant. A layout that cannot survive
  // being ignored is only a fault relative to how long they actually leave it.
  const { haulHours } = cadenceHours(useCadence((state) => state.value));
  return useMemo(
    () =>
      colonyStopTierAdvice({
        colony: advice.colony,
        planetType: advice.planetType,
        pi,
        prices,
        revenuePrices,
        taxRate,
        bufferHours: haulHours,
      }),
    [advice.colony, advice.planetType, pi, prices, revenuePrices, taxRate, haulHours]
  );
}

interface ColonyCardProps {
  advice: Extract<PlanetAdvice, { kind: 'built' }>;
  pi: PiData;
  /** The hub every price on this card came from. */
  hub: TradeHub;
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

  const { haulHours } = cadenceHours(useCadence((state) => state.value));
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
        bufferHours: haulHours,
      }),
    [
      advice.planetType,
      picked,
      pi,
      ceiling,
      rate,
      assumedLinkCost,
      prices,
      revenuePrices,
      taxRate,
      haulHours,
    ]
  );

  // No card at all when there is nowhere to put a Command Center. One dashed
  // box per uncolonised planet, each repeating the same sentence about a
  // *skill*, is several boxes' worth of page saying one thing that is not
  // about any of the planets they are labelled with. `ColonyStrip` says it
  // once, as the locked slot at the end of the pilot's own colony list.
  if (noSlotFree) return null;

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
/**
 * The pins a fitted layout is built from, in build order.
 *
 * Production pins only. The Launchpad and any Storage Facility are overhead
 * every colony carries whatever it makes, so naming them here would pad the
 * one line on the card that has to stay scannable — `buildPlanBasis` carries
 * the rest.
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
        {t(best.tier === 0 ? 'piAdvisor.directiveBuildRaw' : 'piAdvisor.directiveBuildMake', {
          layout: layoutLabel(best.pins, t),
          name: best.name,
          tier: best.tier,
        })}
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
  hub,
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
      hub={hub}
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
  // Which hub the pilot can reach, or 'none'. It is both the permission to
  // plan a purchase and the market every figure on the tab is priced at.
  const sourcing = useMarketSourcing((state) => state.value);
  const hydrateBuyInputs = useMarketSourcing((state) => state.hydrate);
  const setSourcing = useMarketSourcing((state) => state.setValue);
  // 'none' is a refusal to plan a purchase, not a refusal to price anything:
  // the output still has to be valued somewhere, so the reference hub stands
  // in and nothing is offered as a buy.
  const buyHub = getTradeHub(sourcing === 'none' ? DEFAULT_TRADE_HUB.id : sourcing);
  const priceHub = buyHub ?? DEFAULT_TRADE_HUB;
  const buyInputs = sourcing !== 'none';
  const withAlts = useAltColonies((state) => state.value);
  const hydrateAlts = useAltColonies((state) => state.hydrate);
  const setWithAlts = useAltColonies((state) => state.setValue);
  useEffect(() => {
    void hydrateAlts();
  }, [hydrateAlts]);
  useEffect(() => {
    void hydrateBuyInputs();
  }, [hydrateBuyInputs]);
  const { restartDays, haulDays } = useCadence((state) => state.value);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await loadAdvisorSnapshot(characterId, priceHub);
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
  }, [characterId, priceHub]);

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

  // Same layering as the picks above, for the same reason: an edit has to
  // repaint the whole tab's margins immediately, and a `setState` in an effect
  // keyed on the snapshot would drop one made while a reload was in flight.
  const [customsEdits, setCustomsEdits] = useState<CustomsOverrides | null>(null);
  // What is actually in the box, while it is being typed.
  //
  // Rendering `customsRatePercent(rate)` straight into `value` made decimals
  // unreachable: after "12", typing "." parses back to 12, the prop never
  // changes, and React restores "12" — so `step={0.5}` invited a precision the
  // control silently refused. Held per system, so switching systems shows that
  // system's own figure rather than the last one typed. `PlanPanel` holds its
  // rate the same way.
  // Rebuilds are hidden until asked for. They are an alternative plan, not
  // more of the list above them, and a page that opens with both reads as one
  // longer worklist whose figures sum. They do not.
  const [includeRebuilds, setIncludeRebuilds] = useState(false);
  const customsOverrides = customsEdits ?? snapshot?.customsOverrides ?? EMPTY_CUSTOMS;

  const writeCustoms = useCallback(
    (next: CustomsOverrides) => {
      setCustomsEdits(next);
      // Fire-and-forget, like every other Editable Data write here. The layer
      // above is what the panel renders, and a failed write must not take it
      // down.
      void setSyncedSetting(SYNCED_PI_CUSTOMS_KEY, next)
        .then(() => scheduleSync(characterId))
        .catch(() => {});
    },
    [characterId]
  );

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

  /**
   * What the chosen restart cadence gives, against the best cadence on offer,
   * on this character's own ground.
   *
   * Averaged over every extractor program that carries an install-time
   * baseline rather than read off one: the ratio barely moves between
   * programs — the decay curve's shape is the same whatever the quantity — but
   * picking one pin would leave the figure jumping between refreshes as
   * programs expire and restart. Null when no program can be projected at
   * all, which is a refusal the control renders rather than a 100%.
   */
  const restartYield = useMemo(() => {
    const programs = [...(snapshot?.details.values() ?? [])].flatMap((detail) =>
      extractorProgramsFromPins(detail.pins)
    );
    const hours = PI_CADENCE_DAYS.map((days) => days * 24);
    const chosenHours = restartDays * 24;
    const ratios = programs
      .map((program) => restartCadenceYield({ program, cadences: hours }))
      .map((scored) => scored.find((entry) => entry.hours === chosenHours)?.relativeToBest)
      .filter((ratio): ratio is number => ratio !== undefined);
    if (ratios.length === 0) return null;
    return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  }, [snapshot, restartDays]);

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
  // The rate this system's chains are actually costed at.
  const activeRate = customsRateFor(
    activeSystem.systemId,
    customsOverrides,
    activeSystem.customsRate
  );
  const customsEdited = customsOverrides[activeSystem.systemId] !== undefined;

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
      taxRateByPlanet.set(
        colony.planet_id,
        customsRateFor(system.systemId, customsOverrides, system.customsRate)
      );
    }
  }
  // The alts join the *plan*, never the cards: those planets are not this
  // Character's to rebuild, and a card offering to pull a pin off somebody
  // else's colony would be advice aimed at the wrong pilot.
  const altsInPlan = withAlts ? snapshot.altAdvice : EMPTY_ADVICE;
  for (const [planetId, rate] of snapshot.altTaxRates) taxRateByPlanet.set(planetId, rate);
  const planColonies = withAlts ? [...networkAdvice, ...altsInPlan] : networkAdvice;
  const altsPlanned = altsInPlan.filter((entry) => entry.kind === 'built').length;

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
    taxRate: activeRate,
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
  const haulHours = cadenceHours({ restartDays, haulDays }).haulHours;
  // One stop-tier answer per colony, read twice: the worklist takes the
  // recommendations, the blind-spot list takes the refusals. Computing it in
  // each place is how the two would come to disagree about whether a planet
  // could be advised on at all.
  const stopTierByPlanet = new Map(
    advice
      .filter((entry): entry is Extract<PlanetAdvice, { kind: 'built' }> => entry.kind === 'built')
      .map((entry) => [
        entry.planetId,
        colonyStopTierAdvice({
          colony: entry.colony,
          planetType: entry.planetType,
          pi: snapshot.pi,
          prices: snapshot.prices,
          revenuePrices: snapshot.revenuePrices,
          taxRate: activeRate,
          bufferHours: haulHours,
        }),
      ])
  );
  const spots = blindSpots({ advice, stopTierByPlanet });

  // What the colonies earn as they stand — the baseline every "you could earn
  // more" figure on this tab is added to, and which the page had no way to
  // state before #956.
  const builtHere = advice.filter(
    (entry): entry is Extract<PlanetAdvice, { kind: 'built' }> => entry.kind === 'built'
  );
  const earnings = totalColonyEarnings(
    builtHere.map((entry) =>
      builtColonyEarnings(entry.colony, snapshot.pi, {
        prices: snapshot.prices,
        revenuePrices: snapshot.revenuePrices,
        taxRate: activeRate,
      })
    )
  );

  const worklistInput = worklistColonies({
    advice,
    pinsByPlanet: new Map(
      [...snapshot.details].map(([planetId, detail]) => [planetId, detail.pins])
    ),
    pi: snapshot.pi,
    prices: snapshot.prices,
    revenuePrices: snapshot.revenuePrices,
    taxRate: activeRate,
    haulHours,
    opportunitiesByHost,
    conversionsByHost,
    typeNames: snapshot.typeNames,
  });
  const worklist = buildWorklist(worklistInput);

  /**
   * One line per colony: its binding load, what the worklist raised against
   * it, and how long it lasts. Reuses the worklist's own throughput rather
   * than measuring again — two readings of "when does this fill" that could
   * disagree is exactly the bug #958 was about.
   */
  const hoursToFullBy = new Map(
    worklistInput.map((colony) => [colony.planetId, colony.throughput?.hoursToFull ?? null])
  );
  const stripRows = colonyStripRows({
    colonies: builtHere.map((entry) => {
      const plan = colonyPlan(entry.colony, snapshot.pi);
      const { load } = entry.colony.pinLoad;
      // The binding one, never a mean: a colony at 95% CPU and 40% Powergrid
      // has no room, and 68% would say it has.
      const used =
        plan.budget.cpu > 0 && plan.budget.powergrid > 0
          ? Math.max(load.cpu / plan.budget.cpu, load.powergrid / plan.budget.powergrid)
          : null;
      return {
        planetId: entry.planetId,
        name: entry.name,
        planetType: entry.planetType,
        load: used,
        hoursToFull: hoursToFullBy.get(entry.planetId) ?? null,
      };
    }),
    worklist,
    haulHours,
  });

  /**
   * The slot past the last colony, when the pilot cannot have it.
   *
   * Never off an assumed cap, for the reason `UnbuiltCard` gives: `planetSlots(null)`
   * is one slot, and read as fact it tells a pilot at Interplanetary
   * Consolidation V — five free slots — that they are full.
   */
  const lockedSlot =
    !snapshot.slots.assumed && snapshot.colonyCount >= snapshot.slots.slots
      ? {
          level: snapshot.slots.slots,
          total: snapshot.slots.slots,
          atMax: snapshot.slots.slots >= PLANET_SLOTS_MAX,
        }
      : null;

  const openColony =
    advice.find(
      (entry): entry is Extract<PlanetAdvice, { kind: 'built' }> =>
        entry.kind === 'built' && entry.planetId === openPlanetId
    ) ?? null;
  return (
    <div className="space-y-3">
      {/*
        The tab's lead: the two questions it exists to answer, beside the
        inputs that set both. The worklist below is the detail.
      */}
      <AdvisorSummary
        list={worklist}
        earnings={earnings}
        spots={spots}
        controls={
          // Remounted per system, which is what clears a half-typed customs
          // rate belonging to the system the pilot just left.
          <HowYouPlay
            key={activeSystem.systemId}
            systems={systems}
            activeSystemId={activeSystem.systemId}
            onSystemIdChange={onSystemIdChange}
            restartYield={restartYield}
            customsPercent={customsRatePercent(activeRate)}
            customsEdited={customsEdited}
            customsTooltip={
              customsEdited
                ? t('piAdvisor.customsRateEdited')
                : customsTooltip(activeSystem.customsSource, t)
            }
            onCustomsChange={(percent) =>
              writeCustoms(
                withCustomsOverride(customsOverrides, activeSystem.systemId, percent / 100)
              )
            }
            onCustomsReset={() =>
              writeCustoms(withoutCustomsOverride(customsOverrides, activeSystem.systemId))
            }
            sourcing={sourcing}
            onSourcingChange={(value) => void setSourcing(value)}
            alts={
              snapshot.altAdvice.length > 0
                ? {
                    planned: altsPlanned,
                    withAlts,
                    onToggle: () => void setWithAlts(!withAlts),
                  }
                : null
            }
          />
        }
      />

      <Panel
        title={t('piAdvisor.worklistTitle')}
        padded={false}
        actions={
          <WorklistToggle
            includeRebuilds={includeRebuilds}
            onChange={setIncludeRebuilds}
            rebuildCount={worklist.rebuilds.length}
          />
        }
      >
        <Worklist list={worklist} includeRebuilds={includeRebuilds} />
      </Panel>

      {/*
        What cannot be answered, beside the colonies it was not answered
        about. Equal halves, because neither is a footnote to the other: one
        says why a figure is missing, the other says which planet it is
        missing from.
      */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={t('piAdvisor.blindTitle')}>
          <BlindSpots spots={spots} />
        </Panel>

        <Panel
          title={t('piAdvisor.colonyStripTitle')}
          padded={false}
          // `actions`, not `meta`: this is the row legend, and it has to sit
          // over the columns it names rather than trailing the title.
          actions={
            <span className="text-[0.625rem] text-text-faint">
              {t('piAdvisor.colonyStripMeta', { hours: Math.round(haulHours) })}
            </span>
          }
        >
          <ColonyStrip rows={stripRows} onOpenPlanet={setOpenPlanetId} locked={lockedSlot} />
        </Panel>
      </div>

      {network && (
        <NetworkPanel
          hub={priceHub}
          plan={network.plan}
          buyInputs={buyInputs}
          assumesRemoval={network.assumesRemoval}
          planetNames={planetNames}
          taxRate={activeRate}
          taxRateByPlanet={taxRateByPlanet}
        />
      )}

      {advice.length === 0 ? (
        <EmptyState title={t('piAdvisor.noPlanetsTitle')} hint={t('piAdvisor.noPlanetsHint')} />
      ) : (
        // Built colonies are rows in the strip above; what is left is the
        // planets with no colony on them. Those keep their cards, because a
        // card is where `ResourcePicker` lives — ticking what you would pull
        // off a planet you have never landed on has no row-sized form, and
        // dropping the card would drop the feature with it.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {advice.map((entry) =>
            entry.kind === 'built' ? null : entry.kind === 'unbuilt' ? (
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
                taxRate={activeRate}
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
            hub={priceHub}
            schematicNames={snapshot.schematicNames}
            typeNames={snapshot.typeNames}
            prices={snapshot.prices}
            revenuePrices={snapshot.revenuePrices}
            taxRate={activeRate}
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
