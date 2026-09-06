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
import { RichnessRanker } from './RichnessRanker';
import {
  assumedExtractionRate,
  estimateUnbuiltPlanet,
  rankedResources,
  type AssumedRate,
} from './richnessEstimate';
import type { PiData, PiPinKind } from '@/sde/types';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetType } from '@/esi/endpoints';
import { EXTRACTOR_HEADS_MAX, spareCapacity } from '@/engine/pi/pinBudget';
import type { PinLoad } from '@/engine/pi/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  loadSystemName,
  loadSystemPlanetIds,
  loadSystemSecurity,
} from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterPlanets, loadAllColonyDetails } from './data';
import {
  colonyBudget,
  loadCommandCenterUpgrades,
  maxColonyBudget,
  type MaxColonyBudget,
} from './colonyBudget';
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
import { colonyFactoryBalance } from './factoryBalanceModel';
import { colonyNetwork } from './networkModel';
import { NetworkPanel } from './NetworkPanel';
import { ColonyActions } from './ColonyActions';
import { idleFacilityPlan } from './colonyActionModel';
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

/**
 * The pin this colony came nearest to affording, and what it would have cost
 * with the link it needs.
 *
 * "The budget is spent" is true and unhelpful: a colony with 13,715 tf and
 * 300 MW free has not spent its budget, it is 100 MW short of one High-Tech
 * plant. Nearness is measured as the fraction of the pin the remainder covers
 * on its tighter axis, so the answer is the pin a pilot is closest to being
 * able to place rather than merely the cheapest one.
 *
 * Null when no kind can be measured that way — a payload with no pin costs at
 * all — rather than naming an arbitrary one.
 */
function nearestPin(
  freeCpu: number,
  freePowergrid: number,
  pi: PiData,
  newLinkCost: PinLoad | null
): { kind: PiPinKind; cost: PinLoad } | null {
  let best: { kind: PiPinKind; cost: PinLoad; fraction: number } | null = null;
  for (const kind of HEADROOM_KINDS) {
    const spec = pi.infrastructure.pins[kind];
    if (!spec) continue;
    const heads = kind === 'extractorControlUnit' ? HEADROOM_EXTRACTOR_HEADS : 0;
    const cost = {
      cpu: spec.cpu + pi.infrastructure.extractorHead.cpu * heads + (newLinkCost?.cpu ?? 0),
      powergrid:
        spec.powergrid +
        pi.infrastructure.extractorHead.powergrid * heads +
        (newLinkCost?.powergrid ?? 0),
    };
    if (cost.cpu <= 0 && cost.powergrid <= 0) continue;
    const fraction = Math.min(
      cost.cpu > 0 ? freeCpu / cost.cpu : Infinity,
      cost.powergrid > 0 ? freePowergrid / cost.powergrid : Infinity
    );
    if (!best || fraction > best.fraction) best = { kind, cost, fraction };
  }
  return best ? { kind: best.kind, cost: best.cost } : null;
}

/**
 * The two pins a leftover budget goes furthest on, in words.
 *
 * Most-of-it-first rather than declaration order: a planner offered "1
 * extractor" and "6 high-tech plants" wants to hear about the six. Two, because
 * the sentence this lands in is a caveat on another number, not a list.
 */
function roomSummary(headroom: Record<PiPinKind, number>, t: TFunction): string {
  return [...HEADROOM_KINDS]
    .filter((kind) => (headroom[kind] ?? 0) > 0)
    .sort((a, b) => (headroom[b] ?? 0) - (headroom[a] ?? 0))
    .slice(0, 2)
    .map((kind) =>
      t('piAdvisor.roomForItem', { count: headroom[kind], pin: t(`piAdvisor.pinKind.${kind}`) })
    )
    .join(' · ');
}

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
  const roster = await loadPiRosterSnapshot(characterId);
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
    const altSecurities = await Promise.all(
      altSystemIds.map((systemId) => loadSystemSecurity(systemId).catch(() => null))
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
/** One shared empty array, so a card with no opportunity keeps a stable prop. */
const EMPTY_OPPORTUNITIES: readonly NetworkOpportunity[] = [];
const EMPTY_CONVERSIONS: readonly NetworkConversion[] = [];
const EMPTY_ADVICE: PlanetAdvice[] = [];

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

/**
 * "Build up to P2 here" — the recommendation, or the one input that stops it.
 *
 * Deliberately a quiet line rather than a banner: it sits under the measured
 * numbers, not over them. Every refusal names the missing input instead of
 * printing a figure with a caveat beside it, the same rule the unbuilt card's
 * estimate follows.
 */
function StopTierLine({
  advice,
  pi,
  prices,
  revenuePrices,
  taxRate,
}: {
  advice: Extract<PlanetAdvice, { kind: 'built' }>;
  pi: PiData;
  prices: Readonly<Record<number, number>>;
  /** What a sale fetches — highest hub buy, falling back to the ask. */
  revenuePrices: Readonly<Record<number, number>>;
  taxRate: number;
}) {
  const { t } = useTranslation();
  const result = useMemo(
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

  const framed = (body: React.ReactNode) => <div className="border-t border-line pt-2">{body}</div>;
  const quiet = (message: string) => <p className="text-[0.6875rem] text-text-dim">{message}</p>;

  // The card's headroom line already says when a radius did not load, so a
  // link-cost refusal says nothing here rather than repeating that sentence.
  if (result.status === 'needs-link-cost') return null;
  if (result.status === 'needs-measured-extraction') {
    return framed(quiet(t('piAdvisor.stopTierNeedsRate')));
  }
  if (result.advice.kind === 'nothing-to-score') return null;
  if (result.advice.kind === 'no-recommendation') {
    // The engine names what stopped every candidate; this only spells it.
    return framed(quiet(t(`piAdvisor.stopTierBlocked.${result.advice.blocker}`)));
  }

  const { best } = result.advice;
  // "Keep selling X raw" is a claim about the status quo, and `stopTier`
  // enumerates *every* P0 this planet type yields — not just the one being
  // extracted. On a gas planet running Base Metals it was recommending Ionic
  // Solutions under a word that says nothing is changing, which reads as
  // "carry on" and is the opposite of the advice. Naming the switch also warns
  // that the output figure below is what a rebuilt colony would make, not what
  // this one makes today.
  const extractsBest =
    best.tier === 0 && advice.colony.extractedPerHour.some((entry) => entry.typeId === best.typeId);
  return framed(
    <CardLine
      label={t(result.alreadyRunning ? 'piAdvisor.stopTierAtLabel' : 'piAdvisor.stopTierLabel')}
    >
      <span className="text-text">
        {best.tier === 0
          ? t(extractsBest ? 'piAdvisor.stopTierSellRaw' : 'piAdvisor.stopTierSwitchRaw', {
              name: best.name,
            })
          : t('piAdvisor.stopTierMake', { name: best.name, tier: best.tier })}
      </span>
      <div className="text-text-dim">
        {t(
          best.tier === 0 && !extractsBest
            ? 'piAdvisor.stopTierValueSwitch'
            : 'piAdvisor.stopTierValue',
          {
            isk: formatIsk(best.marginPerHour),
            units: Math.round(best.unitsPerHour).toLocaleString(),
          }
        )}
      </div>
    </CardLine>
  );
}

function BuiltCard({
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
}: {
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
}) {
  const { t } = useTranslation();
  const { colony } = advice;
  // This colony's own Command Center budget, from its own upgrade level —
  // not the pilot's skill ceiling, which would overstate the headroom of
  // every colony not upgraded to it.
  const budget: PinLoad = colony.budget;
  // A new pin is not reachable without a new link, and a link's cost is
  // distance-based — so the only honest price for one the colony has not built
  // comes from its own links: the longest hop it already has, at level 0. Null
  // when there is none to measure, which the card says rather than charging
  // zero.
  const newLinkCost = colony.pinLoad.newLinkLoad;
  const headroom = useMemo(
    () =>
      spareCapacity(colony.pinLoad.load, budget, pi.infrastructure, {
        headsPerExtractor: HEADROOM_EXTRACTOR_HEADS,
        ...(newLinkCost ? { newLinkCost } : {}),
      }),
    [colony.pinLoad.load, budget, pi.infrastructure, newLinkCost]
  );
  const room = HEADROOM_KINDS.filter((kind) => (headroom[kind] ?? 0) > 0);
  const freeCpu = Math.max(0, budget.cpu - colony.pinLoad.load.cpu);
  const freePowergrid = Math.max(0, budget.powergrid - colony.pinLoad.load.powergrid);
  // What a colony with no room came nearest to affording, link included — the
  // actionable half of "nothing fits", since the answer is nearly always one
  // axis a few hundred MW short of one specific pin.
  const closest = useMemo(
    () => nearestPin(freeCpu, freePowergrid, pi, newLinkCost),
    [freeCpu, freePowergrid, pi, newLinkCost]
  );
  // The next Command Center level, not the pilot's ceiling: levels are bought
  // one at a time, for ISK, per colony.
  const nextLevel = colonyBudget(colony.upgradeLevel + 1, pi);

  // The "remove x, add y" pair. `balance` is what this colony's own extraction
  // can actually feed; `freedHeadroom` is what the budget would hold once the
  // pins nothing feeds are gone — the same `spareCapacity` call as the row
  // above, against a load reduced by exactly those pins.
  const balance = useMemo(() => colonyFactoryBalance(colony, pi), [colony, pi]);
  // The idle-facility decision — remove them, or buy the extraction that feeds
  // them. Computed in `colonyActionModel`, so this card only renders it.
  const idle = useMemo(
    () =>
      idleFacilityPlan({
        colony,
        balance,
        pi,
        spare: {
          cpu: Math.max(0, budget.cpu - colony.pinLoad.load.cpu),
          powergrid: Math.max(0, budget.powergrid - colony.pinLoad.load.powergrid),
        },
        newLinkCost,
      }),
    [colony, balance, pi, budget, newLinkCost]
  );

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

        {colony.pinLoad.linkLoad !== null && colony.linkCount > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piAdvisor.linkDraw', {
              count: colony.linkCount,
              cpu: Math.round(colony.pinLoad.linkLoad.cpu).toLocaleString(),
              powergrid: Math.round(colony.pinLoad.linkLoad.powergrid).toLocaleString(),
            })}
          </p>
        )}

        {colony.pinLoad.unknownTypeIds.length > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piAdvisor.unknownPins', { count: colony.pinLoad.unknownTypeIds.length })}
          </p>
        )}

        <div className="mt-auto border-t border-line pt-2">
          {/*
            A colony with links has a load this app cannot fully measure, so it
            gets no advice at all — the same rule the unbuilt cards follow:
            name what is true, print no number that isn't. Recommending three
            factories to a pilot whose colony is full is the one failure this
            tab exists to avoid.
          */}
          {colony.linkCount > 0 && colony.pinLoad.linkLoad === null ? (
            // Only when the radius itself did not resolve. Links are charged
            // for now (#440), so this is a rare data gap rather than the
            // standing state it used to be.
            <p className="text-[0.6875rem] text-text-dim">
              {t('piAdvisor.roomUnknownRadius', { count: colony.linkCount })}
            </p>
          ) : (
            <ColonyActions
              idle={idle}
              pi={pi}
              spare={{ cpu: freeCpu, powergrid: freePowergrid }}
              newLinkCost={newLinkCost}
              opportunities={opportunities}
              conversions={conversions}
              planetNames={planetNames}
              owners={owners}
              room={roomSummary(headroom, t)}
              closest={room.length === 0 ? closest : null}
            />
          )}

          {/*
            Powergrid is what binds nearly every colony, and on a pilot whose
            skill has outrun their Command Centers there is a level of it
            sitting behind an ISK purchase. The *next* level, not the jump to
            the ceiling: each level is bought separately, so quoting the whole
            distance would describe three purchases as one.

            Only ever said off a trained ceiling. That guard is also structural
            — `maxColonyBudget` reports level 0 when it had to assume — but it
            is written out because the reason is not visible from here.
          */}
          {!ceiling.assumed && colony.upgradeLevel < ceiling.level && (
            <p className="text-[0.6875rem] text-accent">
              {t('piAdvisor.upgradeAvailable', {
                level: colony.upgradeLevel,
                max: ceiling.level,
                cpu: Math.round(nextLevel.budget.cpu - budget.cpu).toLocaleString(),
                powergrid: Math.round(
                  nextLevel.budget.powergrid - budget.powergrid
                ).toLocaleString(),
              })}
            </p>
          )}
        </div>

        <StopTierLine
          advice={advice}
          pi={pi}
          prices={prices}
          revenuePrices={revenuePrices}
          taxRate={taxRate}
        />
      </>
    </PlanetCard>
  );
}

function UnbuiltCard({
  advice,
  order,
  rate,
  prices,
  onOrderChange,
  slots,
  colonyCount,
}: {
  advice: Extract<PlanetAdvice, { kind: 'unbuilt' }>;
  order: readonly number[];
  rate: AssumedRate;
  /** What a sale fetches — highest hub buy, falling back to the ask. */
  prices: Readonly<Record<number, number>>;
  onOrderChange: (planetId: number, order: number[]) => void;
  slots: PlanetSlots;
  colonyCount: number;
}) {
  const { t } = useTranslation();
  // What this planet could yield is worth naming either way — the ranker
  // still takes input, and the pilot may be deciding which colony to move.
  // But a card that says "could extract" to someone with nowhere to put a
  // Command Center is advice they cannot act on until they say so.
  // Never off an assumed cap. `planetSlots(null)` is one slot, and read as
  // fact it tells a pilot at Interplanetary Consolidation V — five free slots
  // — to abandon a colony. Same rule the Command Center ceiling follows: an
  // assumed figure may be shown, never acted on.
  const noSlotFree = !slots.assumed && colonyCount >= slots.slots;
  const localResources = advice.localResources.map((resource) => resource.typeID);
  const nameByType = new Map(advice.localResources.map((r) => [r.typeID, r.name]));

  const ranked = rankedResources(localResources, order);
  const rankedIds = ranked.filter((entry) => entry.rank !== null).map((entry) => entry.typeId);
  const unrankedIds = ranked.filter((entry) => entry.rank === null).map((entry) => entry.typeId);

  const estimate = estimateUnbuiltPlanet({ localResources, order, rate, prices });

  return (
    <PlanetCard planetId={advice.planetId} name={advice.name} planetType={advice.planetType} dashed>
      <>
        {noSlotFree ? (
          <p className="text-xs text-warning">
            {slots.slots >= PLANET_SLOTS_MAX
              ? t('piAdvisor.noSlotFreeMax', { total: slots.slots })
              : t('piAdvisor.noSlotFree', {
                  used: colonyCount,
                  total: slots.slots,
                  level: slots.slots,
                })}
          </p>
        ) : slots.assumed ? null : (
          // Stated on every unbuilt card, not only when the allowance runs
          // out. Six planets in a system against five colonies is not "you
          // cannot build" — it is "you can build one of these, not both", and
          // that is the fact the pilot was reading the system's own planet
          // count as.
          <p className="text-xs text-text-dim">
            {t('piAdvisor.slotsFree', {
              count: Math.max(0, slots.slots - colonyCount),
              total: slots.slots,
            })}
          </p>
        )}

        <CardLine label={t('piAdvisor.couldExtractLabel')}>
          <span className="text-text-dim">
            {advice.localResources.map((resource) => resource.name).join(', ')}
          </span>
        </CardLine>

        <RichnessRanker
          ranked={rankedIds}
          unranked={unrankedIds}
          resourceName={(typeId) => nameByType.get(typeId) ?? String(typeId)}
          onChange={(next) => onOrderChange(advice.planetId, next)}
        />

        {/*
          Every branch here either shows a figure explicitly labelled an
          estimate, or says which input is missing. There is deliberately no
          fourth branch that prints a number with a caveat beside it: a caveat
          is easy to miss, an absent number is not.
        */}
        <div className="mt-auto">
          {estimate.kind === 'estimate' ? (
            <CardLine label={t('piAdvisor.estimatedValueLabel')}>
              <span className="text-text-dim">
                <span className="mr-1 rounded-xs border border-warning/60 px-1 text-[0.625rem] tracking-widest text-warning uppercase">
                  {t('piAdvisor.estimateBadge')}
                </span>
                {t('piAdvisor.estimatedIskPerHour', {
                  isk: formatIsk(estimate.iskPerHour),
                  name: nameByType.get(estimate.typeId) ?? String(estimate.typeId),
                })}
              </span>
            </CardLine>
          ) : null}
          <p className="text-[0.6875rem] text-text-dim">
            {estimate.kind === 'estimate'
              ? t('piAdvisor.estimateBasis', { count: estimate.rate.sampleSize })
              : estimate.kind === 'needs-ranking'
                ? t('piAdvisor.needsScanHint')
                : estimate.kind === 'needs-measured-extraction'
                  ? t('piAdvisor.needsMeasuredExtraction')
                  : t('piAdvisor.needsPrice', {
                      name: nameByType.get(estimate.typeId) ?? String(estimate.typeId),
                    })}
          </p>
        </div>
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

  // Edits made since the snapshot loaded, layered over it rather than copied
  // into their own state. Copying would mean a `setState` in an effect keyed
  // on the snapshot (which `PlanPanel` avoids for the same reason) and would
  // silently drop an edit made while a reload was in flight. Layering keeps
  // the reorder repainting immediately — AC: "reordering updates the estimate
  // without a page reload" — with no second source of truth.
  const [edits, setEdits] = useState<ReadonlyMap<number, number[]>>(EMPTY_RICHNESS);
  const richness = useMemo(() => {
    const merged = new Map(snapshot?.richness ?? EMPTY_RICHNESS);
    for (const [planetId, order] of edits) {
      if (order.length === 0) merged.delete(planetId);
      else merged.set(planetId, order);
    }
    return merged;
  }, [snapshot, edits]);

  const handleOrderChange = useCallback((planetId: number, order: number[]) => {
    // An empty order is kept as an explicit empty entry, not deleted: it has
    // to out-rank whatever the snapshot still holds, or clearing a ranking
    // would immediately fall back to the stored one.
    setEdits((current) => new Map(current).set(planetId, order));
    // Fire-and-forget, like every other Editable Data write here: the layer
    // above is what the card renders, and a failed write must not take the
    // panel down.
    void (order.length === 0 ? clearPlanetRichness(planetId) : setPlanetRichness(planetId, order));
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
                order={richness.get(entry.planetId) ?? EMPTY_ORDER}
                rate={assumedRate}
                prices={snapshot.revenuePrices}
                onOrderChange={handleOrderChange}
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

      <p className="text-xs text-text-dim">{t('piAdvisor.measuredOnlyHint')}</p>
    </div>
  );
}
