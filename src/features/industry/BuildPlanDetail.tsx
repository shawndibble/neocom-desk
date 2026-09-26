import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CollapsiblePanel,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  IconButton,
  InfoTooltip,
  Panel,
  StatChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Checkbox,
  Toast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  FACILITY_PRESETS,
  RIG_KIND_OPTIONS,
  SKILL_IDS,
  EMPTY_RIG_FIT,
  industryActivityOf,
  resolveRigFit,
  setRigSlot,
} from '@/engine/industry/types';
import { makeOrBuy, type MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { totalVolume } from '@/engine/industry/materialVolume';
import {
  autoBuildHere,
  maxAutoBuildDepth,
  type BuildStrategy,
} from '@/engine/industry/autoMakeOrBuy';
import { craftScope } from '@/engine/industry/craftScope';
import { ownedStockSale, sellableMaterials } from '@/engine/industry/ownedStockSale';
import type {
  FacilityKind,
  MaterialPriceBasis,
  MaterialSourcing,
  RigKind,
} from '@/engine/industry/types';
import { rigKindLabelKey, rigFitSummaryLabel } from './rigFitLabels';
import type { BuildPlanChange, SourcingPatchEntry } from './buildPlanStore';
import type { BuildGroupSnapshot } from './buildGroups';
import { GroupTargetLink } from './GroupTargetLink';
import {
  facilityContextFor,
  reactionPlanFacilityContextFor,
  autoBuildDepthContext,
} from './planFacilityContext';
import { useReactionFacilityDefaults, REACTION_FACILITY_PRESETS } from './reactionFacilityDefaults';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { hydrateActivityFacilityDefaults } from './facilityDefaults';
import { retargetPatch } from './retargetPatch';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import {
  ItemContextMenu,
  ItemMoreActions,
  type ItemMenuFor,
} from '@/features/market/ItemContextMenu';
import {
  nameForType,
  toIndustryBlueprint,
  volumeForType,
  type BlueprintCatalog,
} from './blueprintCatalog';
import { planOwnedBlueprints, resolveBuildPlan } from './resolveBuildPlan';
import { buildPlanTypeIds, recipeForLookup } from './recipes';
import { useBpcAcquisitionOffers } from './useBpcAcquisitionOffers';
import { materialPriceBasisOf } from './priceBasis';
import { useMarketSnapshot } from './useMarketSnapshot';
import { formatDuration } from '@/lib/duration';
import { downloadCsv } from '@/lib/downloadCsv';
import { writeToClipboard } from '@/lib/clipboard';
import { unmaskNumber } from '@/lib/numberMask';
import { MaterialsTable, SourcingInput } from './MaterialsTable';
import { BuildRecipeModal } from './BuildRecipeModal';
import { BlueprintAcquisitionModal } from './BlueprintAcquisitionModal';
import { buyPricedLine } from './materialRow';
import { materialsCsvColumns } from './materialsCsv';
import { blueprintsLeftOutCount, hasShoppingList, shoppingListText } from './shoppingList';
import {
  buildRecipe,
  hasSubBuilds,
  materialTableRows,
  shoppingListMaterials,
  subBuildSeconds as computeSubBuildSeconds,
  type MaterialTableRow,
} from './subBuildPlan';
import { formatIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  bulkUseDetected,
  bulkUseNone,
  materialTypeIdKey,
  ownedStockView,
  typeIdsFromKey,
} from './planMaterialsView';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import type { CorpOwnedStockState } from './corpOwnedStock';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import { useAssumedMe } from './assumedMe';
import { useIncludeBlueprintCost } from './includeBlueprintCost';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import { BuildPlanAutoBuildControl } from './BuildPlanAutoBuildControl';
import { ResultsSummary } from './ResultsSummary';
import { BpcCoverageWarning, PlanVerdictHero } from './PlanVerdictHero';
import { PlanSlotLine } from './PlanSlotLine';
import { categoryForActivity } from './planJobSlots';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { ProductionRunsPanel } from './ProductionRunsPanel';
import { BuildSystemInput } from './BuildSystemInput';
import { BuildLocationPicker } from './BuildLocationPicker';
import { buildLocationLabel } from './buildLocationLabel';
import { buildLocationPatch, reactionBuildLocationPatch } from './buildLocationPatch';
import { useDerivedSecurityBand } from './useDerivedSecurityBand';

/** The Build Plan fields this panel edits, sent as an `edit` `BuildPlanChange`. */
export type PlanPatch = Partial<
  Pick<
    BuildPlanRecord,
    | 'runs'
    | 'me'
    | 'te'
    | 'facility'
    | 'rigFit'
    | 'rigLevel'
    | 'security'
    | 'hubId'
    | 'buildSystemId'
    | 'buildSystemName'
    | 'buildLocationId'
    | 'buildLocationName'
    | 'facilityTaxPct'
    | 'materialPriceBasis'
    | 'ownedStockScope'
    | 'includeCorpAssets'
    | 'buildHere'
    | 'includeReactions'
    | 'reactionFacility'
    | 'reactionRigFit'
    | 'reactionSecurity'
    | 'reactionFacilityTaxPct'
    | 'reactionBuildSystemId'
    | 'reactionBuildSystemName'
    | 'reactionBuildLocationId'
    | 'reactionBuildLocationName'
  >
>;

/**
 * The half of a patch that drops the plan's remembered location. Spread by
 * every control that can move the job away from the place the search picked:
 * a Raitaru still named in the box while the plan says NPC station is a label
 * lying about the plan.
 */
const clearedBuildLocation = {
  buildLocationId: undefined,
  buildLocationName: undefined,
} satisfies PlanPatch;

/** @see clearedBuildLocation — the same rule for the Reaction Location. */
const clearedReactionBuildLocation = {
  reactionBuildLocationId: undefined,
  reactionBuildLocationName: undefined,
} satisfies PlanPatch;

interface BuildPlanDetailProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  /** Planetary schematics, for materials no blueprint makes. Null while pi.json loads, or if it failed. */
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  /**
   * Whole-account asset snapshot for owned-stock detection (issue #181),
   * loaded once by `useOwnedStockSnapshot` above this component's own
   * `key={plan.id}` remount boundary in `Industry.tsx` — switching plans
   * must not redo that load, only the (cheap) per-plan aggregation below.
   */
  ownedStockSnapshot: OwnedStockSnapshot;
  /**
   * The active Character's corporation as a second owned-stock source
   * (issue #798's Corp Assets toggle), loaded once by
   * `useCorpOwnedStockSource` above the same remount boundary as
   * `ownedStockSnapshot` — it re-resolves on Character switch on its own,
   * independent of which plan is open.
   */
  corpOwnedStock: CorpOwnedStockState;
  /**
   * The active Character's corporation's blueprints as a second ownership
   * source (issue #839), loaded once by `useCorpOwnedBlueprints` above the
   * same remount boundary as `corpOwnedStock`. Folded into `ownedBlueprints`
   * below exactly when `plan.includeCorpAssets` is on — the same toggle
   * `corpOwnedStock` already answers to, not a second one.
   */
  corpOwnedBlueprints: CorpOwnedBlueprintsState;
  /**
   * Every write this panel makes to its plan, as one `BuildPlanChange` — a
   * pilot edit, a derived fix, or sourcing edits. The caller hands it to
   * `buildPlanStore.applyBuildPlanChange`, which owns the merge, `updatedAt`
   * and sync rules for each kind.
   */
  onChange: (change: BuildPlanChange) => void;
  /** Materials-row context menu (CONTEXT.md round 26) — the same actions the Market and Assets rows offer. */
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the material under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  /** This plan's group's last Retarget (issue #632), or null when ungrouped or not yet Retargeted. */
  groupSnapshot: BuildGroupSnapshot | null;
  /**
   * The picker/override modal's "search BPC Sourcing" action (issue #839) —
   * navigates to `bpcSourcingHref(<typeID>)`. A prop rather
   * than an inline `useNavigate` here, since this component stays
   * route-agnostic; `IndustryPlanPage.tsx` supplies it.
   */
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
}

/**
 * `SourcingInput.parse` for Runs/ME/TE: unlike the materials sourcing
 * fields it was built for, these three are always-defined numbers with no
 * "unset" state, so blank or unusable input has nowhere to fall but back to
 * `current` — which also, via `SourcingInput`'s "skip onCommit when
 * unchanged" rule, is exactly what makes an emptied-then-abandoned field
 * commit nothing instead of forcing a minimum.
 */
function parseOrKeep(current: number, raw: string, transform: (n: number) => number): number {
  const n = unmaskNumber(raw);
  return n === undefined ? current : transform(n);
}

/** Build Plan inputs (runs, ME/TE, facility, rig, security, hub, tax) + materials/results. */
export function BuildPlanDetail({
  plan,
  catalog,
  pi,
  ownedBlueprints,
  modifiers,
  ownedStockSnapshot,
  corpOwnedStock,
  corpOwnedBlueprints,
  onChange,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
  groupSnapshot,
  onSearchBpcSourcing,
}: BuildPlanDetailProps) {
  const { t } = useTranslation();

  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID) ?? null;
  const blueprint = useMemo(() => (entry ? toIndustryBlueprint(entry.blueprint) : null), [entry]);
  const activity = blueprint ? industryActivityOf(blueprint) : 'manufacturing';
  const hub = useMemo(() => getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB, [plan.hubId]);
  // The plan owner's standing toward this hub's NPC owner (issue #1238), for
  // the broker fee/break-even price every result below prices with.
  const tradeHubStandings = useTradeHubStandings(plan.characterId);
  const standing = tradeHubStanding(tradeHubStandings, hub.id);
  const facilityPreset = FACILITY_PRESETS[plan.facility];
  // Include Reactions (issue #698): meaningless for a reaction-activity plan,
  // which is always eligible via its own top-level facility regardless of
  // this flag — see `reactionCraftEligible`.
  const includeReactions = plan.includeReactions ?? false;
  // Production methods this plan may currently mark buildable — the one
  // answer the recursive engine, the manual toggle and Auto Build all share,
  // so they cannot disagree (`craftScope`'s own doc comment).
  const craftScopeList = useMemo(
    () => craftScope(activity, includeReactions),
    [activity, includeReactions]
  );

  // One level deeper than the plan itself needs: the make-or-buy marker
  // quotes each material's own recipe, and a quote is only as good as the
  // inputs it can price. Same batched Fuzzwork call either way. Shared with
  // `useComparedBuildResults.ts` (issue #453) via `buildPlanTypeIds`, so the
  // Compare table widens its price fetch exactly the same way this does.
  const typeIds = useMemo(() => {
    if (!blueprint) return [] as number[];
    return buildPlanTypeIds(blueprint, { catalog, pi });
  }, [blueprint, catalog, pi]);

  // The ME every sub-build with no owned blueprint is quoted at. Hydrated
  // here rather than read raw, so a pilot who set it sees their own figure
  // instead of one frame of the default.
  const assumedMe = useAssumedMe((state) => state.value);
  const hydrateAssumedMe = useAssumedMe((state) => state.hydrate);
  useEffect(() => {
    void hydrateAssumedMe();
  }, [hydrateAssumedMe]);

  // Whether Blueprint Acquisition's resolved cost counts toward this plan's
  // totalCost/profit at all — see includeBlueprintCost.ts.
  const includeBlueprintCost = useIncludeBlueprintCost((state) => state.value);
  const hydrateIncludeBlueprintCost = useIncludeBlueprintCost((state) => state.hydrate);
  useEffect(() => {
    void hydrateIncludeBlueprintCost();
  }, [hydrateIncludeBlueprintCost]);

  // Pre-fills a fresh plan's Reaction Location the first time Include
  // Reactions is turned on for it (issue #698) — read here, alongside
  // `assumedMe`, so it's in hand the moment `toggleIncludeReactions` needs it
  // rather than one render behind.
  const reactionFacilityDefaults = useReactionFacilityDefaults((state) => state.value);
  const hydrateReactionFacilityDefaults = hydrateActivityFacilityDefaults;
  useEffect(() => {
    void hydrateReactionFacilityDefaults();
  }, [hydrateReactionFacilityDefaults]);

  const [refreshTick, setRefreshTick] = useState(0);
  /**
   * What the shopping-list button says right now. A clipboard write leaves
   * nothing on screen to look at, so the control has to report itself —
   * `null` is the resting label, and the other two states replace it for a
   * moment. Same beside-the-control confirmation the skill planner's export
   * uses, in the one form a toolbar IconButton has: its own icon and label.
   */
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  /** Blueprint Acquisition rows (issue #838) `shoppingListText` just left out of a successful copy. */
  const [blueprintsLeftOut, setBlueprintsLeftOut] = useState(0);
  // Verdict-first layout: the inputs fold behind a chip summary, the ledger
  // follows the viewport (open where there is room beside the materials,
  // folded on a phone until asked), and the one Calculation Breakdown is
  // owned here so the hero's button and the ledger's "?"s open the same modal.
  const [setupOpen, setSetupOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const [costsOpen, setCostsOpen] = useState<boolean | null>(null);
  const costsExpanded = costsOpen ?? isDesktop;
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [logRequest, setLogRequest] = useState(0);
  // One source for both the index that is fetched and the name that labels it,
  // so the two can never disagree. A plan holding only half the pair (an id
  // with no name, or the reverse) builds at its hub — see `BuildPlanRecord`.
  const buildSystem =
    plan.buildSystemId !== undefined && plan.buildSystemName !== undefined
      ? { id: plan.buildSystemId, name: plan.buildSystemName }
      : null;
  // What the search box says the plan is pointed at — through the same helper
  // the picker's result rows use, so the wording cannot change as a pick's
  // write lands. Null for a plan that was never pointed at a place.
  const buildLocationName =
    plan.buildLocationId === undefined
      ? null
      : buildLocationLabel(
          plan.buildLocationName ?? null,
          plan.facility,
          buildSystem?.name ?? hub.systemName,
          t
        );

  // The Reaction Location's own build system / label pair, mirroring
  // `buildSystem`/`buildLocationName` above one-for-one (issue #698).
  const reactionBuildSystem =
    plan.reactionBuildSystemId !== undefined && plan.reactionBuildSystemName !== undefined
      ? { id: plan.reactionBuildSystemId, name: plan.reactionBuildSystemName }
      : null;
  const reactionBuildLocationName =
    plan.reactionBuildLocationId === undefined
      ? null
      : buildLocationLabel(
          plan.reactionBuildLocationName ?? null,
          plan.reactionFacility ?? 'athanor',
          reactionBuildSystem?.name ?? t('industry.reactionLocationNotSet'),
          t
        );

  // The band is derived, not typed, so it is reconciled here rather than only
  // on edit — otherwise a plan saved before the Security field went away keeps
  // a band nothing can correct, and still drives the rig multiplier.
  useDerivedSecurityBand(buildSystem?.id, hub.security, plan.security, (security) =>
    onChange({ kind: 'derived', patch: { security } })
  );
  // Same reconciliation for the Reaction Location. There is no hub fallback
  // for a place with no hub of its own — highsec is the same "nothing chosen
  // yet" default `reactionPlanFacilityContextFor` already assumes.
  useDerivedSecurityBand(
    reactionBuildSystem?.id,
    'highsec',
    plan.reactionSecurity ?? 'highsec',
    (security) => onChange({ kind: 'derived', patch: { reactionSecurity: security } })
  );

  // Distinct from `pricesReady` below: that one collapses "still fetching"
  // and "the live ESI call failed" into the same false, which used to flash
  // the "prices unavailable" warning on every fresh load before the first
  // response landed.
  const {
    snapshot,
    fetchedAt,
    loading: pricesLoading,
  } = useMarketSnapshot(hub, typeIds, buildSystem?.id, activity, refreshTick);

  // The Reaction Location's own cost index — a second, independent fetch
  // (issue #698): sharing `snapshot` would charge a reaction job at the
  // primary facility's system, which is exactly the wrong number Include
  // Reactions exists to fix. Hub prices/adjusted prices are cached by
  // (station, type) after the primary fetch above already resolved them, so
  // this only really costs the one additional cost-index lookup.
  const { snapshot: reactionSnapshot } = useMarketSnapshot(
    hub,
    typeIds,
    reactionBuildSystem?.id,
    'reaction',
    refreshTick
  );

  // Corp-owned blueprints (issue #839) fold in only when this plan's own
  // Corp Assets toggle is on — the same rule `resolveBuildPlan` applies
  // below, through the same helper, so the picker's owned copies and the
  // recipe lookup can never disagree with what the result was priced from.
  const effectiveOwnedBlueprints = useMemo(
    () =>
      planOwnedBlueprints(
        { includeCorpAssets: plan.includeCorpAssets },
        ownedBlueprints,
        corpOwnedBlueprints
      ),
    [ownedBlueprints, plan.includeCorpAssets, corpOwnedBlueprints]
  );

  /**
   * What produces a material — general over any typeID a `buildHere` choice
   * might reach, at any depth, not only the blueprint's own materials. Recipe
   * lookup needs no live prices, so this is available even while the market
   * snapshot is still loading, which is what keeps the build control present
   * during a slow or unreachable price fetch. Kept apart from `resolved`
   * below so its identity survives a runs/ME keystroke — `canBuildHere` and
   * `autoBuildMaxDepth` key on it.
   */
  const recipeFor = useMemo(
    () =>
      recipeForLookup({
        catalog,
        pi,
        ownedBlueprints: effectiveOwnedBlueprints,
        assumedMeForUnowned: assumedMe,
      }),
    [catalog, pi, effectiveOwnedBlueprints, assumedMe]
  );

  // Blueprint Acquisition (issue #838): BPC Sourcing offers for this plan's
  // own Trade Hub region, grouped by blueprint typeID. Degrades to "no
  // offers" when BPC Sourcing sync isn't configured or hasn't landed yet —
  // the price cascade then falls straight through to the BPO's own hub sell
  // price, same as if no contract offer were listed.
  const bpcOffersFor = useBpcAcquisitionOffers(plan.characterId, hub.regionId);

  // The one place "can this be built here" is decided — `craftScopeList`
  // (issue #698) is the same answer Auto Build's own Craft Scope and the
  // recursive engine use, so the three can never disagree. General over
  // depth: a recipe input introduced by one build is exactly as buildable as
  // the plan's own materials, which is what lets a player keep drilling down
  // as many levels as the recipe tree actually has.
  const canBuildHere = useMemo(
    () =>
      (typeID: number): boolean => {
        const method = recipeFor(typeID)?.method;
        return method !== undefined && craftScopeList.includes(method);
      },
    [recipeFor, craftScopeList]
  );

  /** @see facilityContext — the Reaction Location's own "where and how" half, `null` until one is configured. */
  const reactionPlanFacilityContext = useMemo(
    () =>
      reactionPlanFacilityContextFor({
        reactionFacility: plan.reactionFacility,
        reactionRigFit: plan.reactionRigFit,
        reactionSecurity: plan.reactionSecurity,
        reactionFacilityTaxPct: plan.reactionFacilityTaxPct,
      }),
    [plan.reactionFacility, plan.reactionRigFit, plan.reactionSecurity, plan.reactionFacilityTaxPct]
  );

  /**
   * The facility/rig/security/tax inputs Auto Build's depth walk needs — the
   * "where and how a job runs" half, which doesn't depend on whether prices
   * have loaded yet.
   */
  const facilityContext = useMemo(
    () =>
      facilityContextFor({
        facility: plan.facility,
        rigFit: plan.rigFit,
        rigLevel: plan.rigLevel,
        security: plan.security,
        facilityTaxPct: plan.facilityTaxPct,
      }),
    [plan.facility, plan.rigFit, plan.rigLevel, plan.security, plan.facilityTaxPct]
  );

  /**
   * The whole plan, resolved in one pass by `resolveBuildPlan` — the same
   * call Compare and every Group Rollup make, so this page cannot price a
   * plan differently from them. Everything the page reads off it:
   *
   * - `result`/`error`: the Results panel and materials table.
   * - `makeOrBuyContext`: every make-or-buy verdict; null until live prices
   *   land (a fee-free quote would call almost everything worth building).
   * - `resolvedMe`/`resolvedTe`: the tier Blueprint Acquisition resolved for
   *   the plan's own product. `plan.me`/`plan.te` stay whatever they
   *   last were (Setup no longer edits them); every reader below uses the
   *   resolved pair, so there is exactly one number in play.
   * - `materialPrices`: the plan's price basis — both sides come from the
   *   snapshot already in hand, so toggling it re-computes, never refetches.
   *
   * One memo, one fresh tier pool: the top-level claim and the tree's nested
   * claims share it, and a re-run of this memo starts from nothing rather
   * than re-claiming against copies a previous run already took.
   */
  const resolved = useMemo(
    () =>
      resolveBuildPlan(
        plan,
        {
          catalog,
          pi,
          ownedBlueprints,
          corpBlueprints: corpOwnedBlueprints,
          assumedMe,
          modifiers,
          standing,
          bpcOffersFor,
          includeBlueprintCost,
        },
        { snapshot, reactionSystemCostIndex: reactionSnapshot?.systemCostIndex }
      ),
    [
      plan,
      catalog,
      pi,
      ownedBlueprints,
      corpOwnedBlueprints,
      assumedMe,
      modifiers,
      standing,
      bpcOffersFor,
      includeBlueprintCost,
      snapshot,
      reactionSnapshot?.systemCostIndex,
    ]
  );
  const { result, error, makeOrBuyContext, resolvedMe, resolvedTe, materialPrices, bpcCoverage } =
    resolved;

  /**
   * Both liquidation bases at once, so the Use-or-sell toggle switches between
   * two numbers already in hand rather than re-deriving one per click. Sell-now
   * reads the buy side of the book (what a standing order pays today), sell-order
   * the sell side (what listing your own stack asks) — deliberately independent
   * of the plan's *material* price basis, which is about buying, not selling.
   */
  const ownedSale = useMemo(() => {
    if (!result || !snapshot) return null;
    const materials = sellableMaterials(result.materials);
    return {
      instant: ownedStockSale(
        materials,
        snapshot.hubBuyPrices,
        'instant',
        modifiers.skills,
        standing
      ),
      order: ownedStockSale(materials, snapshot.hubPrices, 'order', modifiers.skills, standing),
    };
  }, [result, snapshot, modifiers, standing]);

  const pricesReady =
    snapshot !== null && snapshot.adjustedPrices !== null && snapshot.systemCostIndex !== null;

  /**
   * Auto Build's own depth range (issue #695): the plan's actual tree
   * depth, independent of whether live prices have loaded — depth discovery
   * never prices anything, so gating it on `makeOrBuyContext` (null until
   * `pricesReady`) would leave Apply disabled during a slow price
   * fetch for no reason. Built from `reactionPlanFacilityContext`, not the
   * price-resolved Reaction Location in `makeOrBuyContext`: that one stays
   * `undefined` until its own market snapshot lands, which would understate
   * this plan's depth for as long as that fetch is in flight whenever a
   * Reaction Location is configured. `autoBuildDepthContext` is the same seam
   * `autoBuildGroup.ts`'s per-member depth walk uses.
   */
  const autoBuildMaxDepth = useMemo(() => {
    if (!blueprint) return 0;
    return maxAutoBuildDepth(blueprint, resolvedMe, {
      recipeFor,
      ctx: autoBuildDepthContext(facilityContext, reactionPlanFacilityContext, modifiers),
      runs: plan.runs,
    });
  }, [
    blueprint,
    resolvedMe,
    plan.runs,
    recipeFor,
    facilityContext,
    modifiers,
    reactionPlanFacilityContext,
  ]);

  /**
   * The materials table's rows: `result.materials` is already the whole
   * resolved tree — `buildVsBuy` applies every `buildHere` choice itself, at
   * whatever depth (src/engine/industry/materialResolution) — so this only
   * has to flatten it to one row per material. One computation, not two:
   * before this, a separate expansion priced the table while the Results
   * panel above priced the plan as written, and the two could disagree the
   * moment a build was toggled (docs/context/decisions, since superseded).
   */
  const visibleMaterials = useMemo(
    () => (result ? materialTableRows(result.materials) : []),
    [result]
  );

  // Same exclusion the volume column itself applies (issue #874): a built
  // row's quantity is produced here, never hauled at that typeID — its own
  // inputs already carry that volume as their own rows in this same list.
  const materialVolume = useMemo(
    () =>
      totalVolume(
        visibleMaterials.filter((material) => material.subBuilds.length === 0),
        (typeID) => volumeForType(catalog, typeID)
      ),
    [visibleMaterials, catalog]
  );

  // Every material on the table, not just the blueprint's own: a mineral a
  // sub-build introduced is as ownable as anything else, and while this was
  // the blueprint's material list a player with 10,714,573 Tritanium in the
  // hangar was told they owned none of it the moment the Tritanium row came
  // from a component's recipe rather than the ship's. Content-keyed, not
  // array-keyed — see `materialTypeIdKey` for why that matters.
  const materialTypeIdsKey = useMemo(() => materialTypeIdKey(visibleMaterials), [visibleMaterials]);
  const materialTypeIds = useMemo(() => typeIdsFromKey(materialTypeIdsKey), [materialTypeIdsKey]);
  // Folded in only when this plan's own toggle is on — Corp Assets is a
  // per-plan choice (issue #798), not something every plan inherits merely
  // because the active Character happens to hold Director on some corp.
  const includeCorpAssets = (plan.includeCorpAssets ?? false) && corpOwnedStock.available;
  const {
    stock: detectedStock,
    characterNames,
    locationNames,
    incompleteCharacters,
  } = useDetectedOwnedStock(
    ownedStockSnapshot,
    materialTypeIds,
    includeCorpAssets ? corpOwnedStock.source : null
  );

  // Skill-gate marker for a sub-build row: account-wide, not this plan's own
  // `skills` prop — same precedent Active Jobs' slot header and
  // `MarketWideOpportunitiesPanel` both follow.
  const skillGateCharacterIds = [...characterNames.keys()];
  const accountSkills = useAccountSkillLevels(skillGateCharacterIds);
  // Materials the most recent Auto Build pass routed to buy specifically for
  // a skill gate (issue #1231's "and says why") — those rows leave
  // `visibleMaterials`'s sub-build set, so the marker below must be told
  // about them separately rather than losing the reason a pilot just saw.
  const [autoBuildSkillGated, setAutoBuildSkillGated] = useState<
    ReadonlyMap<number, Extract<SkillGateVerdict, { gated: true }>>
  >(new Map());
  const skillGates = useMemo(() => {
    const gates = new Map<number, SkillGateVerdict>();
    for (const material of visibleMaterials) {
      if (material.subBuilds.length === 0) continue;
      const requirements = catalog.byProductTypeID.get(material.typeID)?.blueprint.skills ?? [];
      gates.set(material.typeID, evaluateSkillGate(requirements, accountSkills));
    }
    for (const [typeID, verdict] of autoBuildSkillGated) {
      if (!gates.has(typeID)) gates.set(typeID, verdict);
    }
    return gates;
  }, [visibleMaterials, catalog, accountSkills, autoBuildSkillGated]);

  // The plan's own top-level product (issue #1231) — the header this same
  // account-wide check used to explicitly skip (see the 2026-09-14 decision
  // this reverses for the top-level case).
  const topLevelSkillGate = useMemo(
    () => evaluateSkillGate(entry?.blueprint.skills ?? [], accountSkills),
    [entry, accountSkills]
  );

  // `scopedStock` is narrowed to the plan's owned-stock scope (issue #454);
  // `detectedStock` stays the galaxy-wide picture the breakdown popover shows.
  const { detection, scopedStock } = useMemo(
    () =>
      ownedStockView(
        {
          stock: detectedStock,
          scope: plan.ownedStockScope,
          characterNames,
          locationNames,
          incompleteCharacters,
          // The corp source's own incompleteness (a capped/missing asset
          // page) folds in only while it's actually contributing — an
          // untoggled or unavailable corp source has nothing to be
          // incomplete about.
          incompleteCorporation:
            includeCorpAssets && corpOwnedStock.incomplete ? corpOwnedStock.corporationName : null,
          corporationName: corpOwnedStock.corporationName,
        },
        t
      ),
    [
      detectedStock,
      plan.ownedStockScope,
      characterNames,
      locationNames,
      incompleteCharacters,
      includeCorpAssets,
      corpOwnedStock.incomplete,
      corpOwnedStock.corporationName,
      t,
    ]
  );

  // Over every row on the table, not the blueprint's own materials: the bulk
  // action has to reach exactly what the per-row offers reach, or "use all"
  // silently skips every mineral a sub-build introduced while the row beside
  // it is still offering to apply one. The fill/clear rules themselves live
  // in `planMaterialsView.ts`, shared with the Build Group's ledger.
  const bulkDetectedPatches = useMemo<SourcingPatchEntry[]>(
    () =>
      bulkUseDetected(
        visibleMaterials,
        (typeID) => plan.materialSourcing?.[typeID]?.ownedQuantity,
        scopedStock
      ).map(({ typeID, ownedQuantity }) => ({ typeID, patch: { ownedQuantity } })),
    [visibleMaterials, plan.materialSourcing, scopedStock]
  );
  const bulkClearPatches = useMemo<SourcingPatchEntry[]>(
    () =>
      bulkUseNone(visibleMaterials, (typeID) => plan.materialSourcing?.[typeID]?.ownedQuantity).map(
        ({ typeID, ownedQuantity }) => ({ typeID, patch: { ownedQuantity } })
      ),
    [visibleMaterials, plan.materialSourcing]
  );

  /**
   * The recipe behind whichever built row's "Build it" is open — the runs and
   * ingredient list the flat table no longer nests (`subBuildPlan`). Held as
   * a typeID rather than the recipe itself so a re-priced or re-toggled plan
   * refreshes what the modal shows instead of freezing the numbers it opened
   * with; a typeID that is no longer built simply resolves to `null`, which
   * is also how the modal closes when its row stops being built underneath it.
   */
  const [recipeTypeId, setRecipeTypeId] = useState<number | null>(null);

  /** Which Blueprint Acquisition row's picker/override modal (issue #839) is open, if any. */
  const [acquisitionPickerTypeId, setAcquisitionPickerTypeId] = useState<number | null>(null);
  const acquisitionPickerOwnedCopies = useMemo(
    () =>
      acquisitionPickerTypeId === null
        ? []
        : effectiveOwnedBlueprints
            .filter((b) => b.type_id === acquisitionPickerTypeId)
            .map((b) => ({ me: b.material_efficiency, te: b.time_efficiency, runs: b.runs })),
    [acquisitionPickerTypeId, effectiveOwnedBlueprints]
  );

  const openRecipe = useMemo(() => {
    const row = visibleMaterials.find((material) => material.typeID === recipeTypeId);
    return row ? buildRecipe(row) : null;
  }, [visibleMaterials, recipeTypeId]);

  /**
   * What the plan still has to shop for: every leaf of the resolved tree,
   * merged by type. Feeds the shopping-list copy and the CSV export — never
   * the table, which shows the full tree including what it's building.
   */
  const shoppingMaterials = useMemo(
    () => (result ? shoppingListMaterials(result.materials) : []),
    [result]
  );

  const anySubBuilds = useMemo(() => (result ? hasSubBuilds(result.materials) : false), [result]);

  /** Wall-clock every sub-job in the tree adds before the main run can even be installed. */
  const subBuildTimeSeconds = useMemo(
    () => (result ? computeSubBuildSeconds(result.materials) : 0),
    [result]
  );

  /**
   * Make-or-buy verdict per material (CONTEXT.md round 29), computed once for
   * the table and the CSV export rather than per row render. Covers every
   * row regardless of depth: a recipe input a build introduced is exactly as
   * eligible for advice — and for the build-here control itself — as one of
   * the plan's own materials.
   */
  const materialAdvice = useMemo(() => {
    const verdicts = new Map<number, MakeOrBuy>();
    if (!makeOrBuyContext) return verdicts;
    for (const material of visibleMaterials) {
      // Priced at what it would cost to buy even while it is being built
      // (`buyPricedLine`) — the verdict compares against buying, so a built
      // row's null unit price would silently withdraw the advice exactly
      // when the player is acting on it.
      const verdict = makeOrBuy(
        buyPricedLine(material, plan.materialSourcing, materialPrices),
        recipeFor(material.typeID),
        makeOrBuyContext
      );
      if (verdict) verdicts.set(material.typeID, verdict);
    }
    return verdicts;
  }, [visibleMaterials, makeOrBuyContext, recipeFor, plan.materialSourcing, materialPrices]);

  /** Top-level materials the player chose to build — what the sub-build footnote summarizes. */
  const builtTopLevel = useMemo(
    () => (result ? result.materials.filter((material) => material.subBuild !== undefined) : []),
    [result]
  );

  /**
   * What building the chosen material(s) actually costs — the sum of exactly
   * the `lineCost`s `result.materialCost` already added for them, so this is
   * never a second number that could drift from the totals above. Not split
   * into materials/fees: a nested build's own fee is folded proportionally
   * into its parent's `lineCost` whenever the job makes more than the parent
   * needs (EVE sizes jobs in whole runs), so a separately-summed "fees"
   * figure could disagree with what the split inside `lineCost` actually is.
   */
  const subBuildTotal = useMemo(
    () => builtTopLevel.reduce((sum, material) => sum + material.lineCost, 0),
    [builtTopLevel]
  );

  /**
   * What buying the built material(s) outright would have cost instead, for
   * the footnote's comparison — priced the same way a plain (unbuilt) row on
   * this plan is, straight off `materialPrices`/an override, no second
   * `buildVsBuy` pass. `null` when there is nothing to compare, or when any
   * of them genuinely isn't sold at this hub, rather than showing a number
   * that quietly priced the unsold one as free (the bug this replaces).
   */
  const buyInsteadTotal = useMemo(() => {
    if (builtTopLevel.length === 0) return null;
    let total = 0;
    for (const material of builtTopLevel) {
      // Through `buyPricedLine`, the same ladder the make-or-buy advice uses,
      // rather than a third hand-rolled `override ?? hub`: that one guarded
      // only `undefined`, so a NaN or negative override reached this figure
      // and was rendered as ISK. The helper range-checks.
      const { unitPrice } = buyPricedLine(material, plan.materialSourcing, materialPrices);
      if (unitPrice === null) return null;
      total += material.remainingQuantity * unitPrice;
    }
    return total;
  }, [builtTopLevel, plan.materialSourcing, materialPrices]);

  // The copy confirmation is a flash, not a state the panel keeps. Cleared by
  // an effect rather than a `setTimeout` inside the handler so unmounting mid-
  // flash, or clicking again before it fades, cancels the pending timer instead
  // of setting state on a gone component.
  useEffect(() => {
    if (copyState === null) return;
    const timer = setTimeout(() => {
      setCopyState(null);
      setBlueprintsLeftOut(0);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  // Units produced by the job (per-run product quantity x runs); null when
  // the blueprint has no product. Shared by the Results panel and the
  // Production Runs panel's "Log Production" default below.
  const productQuantity = blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null;

  function update(patch: PlanPatch) {
    onChange({ kind: 'edit', patch });
  }

  function changeSourcing(edits: readonly SourcingPatchEntry[]) {
    onChange({ kind: 'sourcing', edits });
  }

  function changeOneSourcing(typeID: number, patch: MaterialSourcing) {
    changeSourcing([{ typeID, patch }]);
  }

  /**
   * Switches one material between being bought and being produced here.
   *
   * The whole list is rewritten rather than the single entry toggled in place,
   * because it is a plain field on the record — unlike `materialSourcing`,
   * which is a nested map and so needs the read-modify-write path a
   * `sourcing` change takes.
   */
  function toggleBuildHere(typeID: number) {
    const current = plan.buildHere ?? [];
    update({
      buildHere: current.includes(typeID)
        ? current.filter((id) => id !== typeID)
        : [...current, typeID],
    });
  }

  /**
   * Include Reactions (issue #698). Turning it on for the first time — no
   * Reaction Location configured yet — pre-fills it from the Settings-level
   * default, a real explicit default rather than copying any other plan's
   * facility (unlike the primary location, which does copy forward for a
   * fresh plan — see `reactionFacilityDefaults.ts`'s module doc). Turning it
   * off only clears the flag: the Reaction Location itself is left alone, so
   * flipping it back on doesn't lose whatever the pilot configured.
   */
  function toggleIncludeReactions(next: boolean) {
    if (next && plan.reactionFacility === undefined) {
      update({
        includeReactions: true,
        reactionFacility: reactionFacilityDefaults.facility,
        reactionRigFit: reactionFacilityDefaults.rigFit,
        reactionFacilityTaxPct: reactionFacilityDefaults.facilityTaxPct ?? undefined,
      });
    } else {
      update({ includeReactions: next });
    }
  }

  /**
   * Auto Build (issue #695): a one-shot bulk write, not a persistent policy
   * (docs/context/decisions). Fully replaces `buildHere` — re-running with
   * different settings, or the same ones again, overwrites whatever
   * craft/buy choices were there before, including hand-picked ones. Always
   * walks this plan's whole tree (`autoBuildMaxDepth`) — the single-plan
   * control offers no depth choice. Craft Scope is `craftScopeList`
   * (issue #698) — the same answer the manual toggle and the recursive
   * engine use, so an Auto Build pass never marks a material the plan itself
   * would then ignore. Planetary is still reserved.
   */
  function applyAutoBuild(options: { strategy: BuildStrategy }) {
    if (!blueprint || !makeOrBuyContext) return;
    const gated = new Map<number, Extract<SkillGateVerdict, { gated: true }>>();
    const picked = autoBuildHere(blueprint, resolvedMe, {
      recipeFor,
      // Account-wide (issue #1231): a material nobody on the account can
      // build is forced to buy regardless of cost — same `accountSkills` the
      // sub-build marker above uses.
      ctx: { ...makeOrBuyContext, accountSkills },
      depth: autoBuildMaxDepth,
      runs: plan.runs,
      scope: craftScopeList,
      strategy: options.strategy,
      onSkillGated: (typeID, verdict) => gated.set(typeID, verdict),
    });
    update({ buildHere: [...picked] });
    setAutoBuildSkillGated(gated);
  }

  /**
   * Unlike Market/Assets, this page already holds the whole blueprint catalog
   * (it needs it to render the plan at all), so the "Build Plan" action
   * resolves synchronously — never the `undefined` "checking…" state those
   * lazily-loading callers pass. For a material something else manufactures
   * the action lands back here with `?product=`, creating or selecting that
   * material's own plan so its build-vs-buy read can be compared with this one.
   */
  function itemContextMenu(
    typeId: number,
    trigger: ReactElement,
    buildHere?: { onToggle: () => void; building: boolean }
  ) {
    return (
      <ItemContextMenu
        typeId={typeId}
        itemName={nameForType(catalog, typeId)}
        blueprintTypeID={catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onToggleBuildHere={buildHere?.onToggle}
        buildingHere={buildHere?.building}
      >
        {trigger}
      </ItemContextMenu>
    );
  }

  /** The same menu on every other item name the page shows — product heading, revenue and owned-sale rows, the recipe and acquisition modals. */
  const itemMenuFor: ItemMenuFor = (typeId, trigger) => itemContextMenu(typeId, trigger);

  function materialContextMenu(material: MaterialTableRow, tr: ReactElement) {
    return itemContextMenu(
      material.typeID,
      tr,
      canBuildHere(material.typeID)
        ? {
            onToggle: () => toggleBuildHere(material.typeID),
            building: material.subBuilds.length > 0,
          }
        : undefined
    );
  }

  /**
   * The visible "More actions" button beside the same menu (WCAG 2.1.1,
   * issue #1498) — every surface `itemContextMenu`/`itemMenuFor` wraps also
   * renders one of these, built from the identical props so the right-click
   * menu and the button can never list different actions.
   */
  function itemActionsFor(
    typeId: number,
    buildHere?: { onToggle: () => void; building: boolean }
  ): ReactElement {
    return (
      <ItemMoreActions
        typeId={typeId}
        itemName={nameForType(catalog, typeId)}
        blueprintTypeID={catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onToggleBuildHere={buildHere?.onToggle}
        buildingHere={buildHere?.building}
      />
    );
  }

  /** The materials table's own row — same `buildHere` wiring as `materialContextMenu`. */
  function materialActionsFor(material: MaterialTableRow): ReactElement {
    return itemActionsFor(
      material.typeID,
      canBuildHere(material.typeID)
        ? {
            onToggle: () => toggleBuildHere(material.typeID),
            building: material.subBuilds.length > 0,
          }
        : undefined
    );
  }

  /**
   * Puts the plan's outstanding materials on the clipboard as multibuy text,
   * so the whole run can be ordered in one paste in-game.
   *
   * The rejection is caught and shown, not left to `void`: a browser that
   * denies clipboard access (permission refused, or a page that lost focus
   * between the click and the write) is a real path, and the same silent
   * failure on the read side is already surfaced by ImportClipboardDialog.
   */
  async function copyShoppingList() {
    if (!result) return;
    try {
      // The flattened leaf list, not the plan's own: a material being
      // produced here is not something to order, and the recipe inputs that
      // replaced it are — however many levels down they sit.
      await writeToClipboard(shoppingListText(shoppingMaterials, (id) => nameForType(catalog, id)));
      setCopyState('copied');
      // Multibuy can't buy a blueprint (issue #1778) — shoppingListText already
      // dropped it; name the count so the pilot knows to buy it by contract.
      setBlueprintsLeftOut(blueprintsLeftOutCount(shoppingMaterials));
    } catch {
      setCopyState('failed');
    }
  }

  function exportMaterialsCsv() {
    if (!result) return;
    downloadCsv(
      'build-materials',
      shoppingMaterials,
      materialsCsvColumns(
        t,
        (typeID) => nameForType(catalog, typeID),
        plan.materialSourcing,
        pricesReady,
        materialAdvice
      )
    );
  }

  const productUnitPrice =
    entry.productTypeID !== null ? (snapshot?.hubPrices[entry.productTypeID] ?? null) : null;

  const breakdownContext = {
    hubName: hub.systemName,
    materialPriceBasis: materialPriceBasisOf(plan.materialPriceBasis),
    me: resolvedMe,
    isReaction: activity === 'reaction',
    accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
    brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
    systemCostIndex: snapshot?.systemCostIndex ?? null,
    costIndexSystemName: buildSystem?.name ?? hub.systemName,
    productName: entry.productName,
    productQuantity: blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null,
    productUnitPrice:
      entry.productTypeID !== null ? (snapshot?.hubPrices[entry.productTypeID] ?? null) : null,
    standing,
  };

  const chip = (label: string, value: string) => (
    <StatChip key={label} label={label} value={value} />
  );
  const setupChips = [
    chip(t('industry.runs'), plan.runs.toLocaleString()),
    ...(activity === 'manufacturing'
      ? [
          chip(t('industry.setupChipMe'), `${resolvedMe}%`),
          chip(t('industry.setupChipTe'), `${resolvedTe}%`),
        ]
      : []),
    // The place the pilot picked, by the name they picked it under; the
    // facility · system · band triple only when no place was picked.
    chip(
      t('industry.buildLocation'),
      buildLocationName ??
        `${facilityPreset.name} · ${buildSystem?.name ?? hub.systemName} · ${t(`industry.${plan.security}`)}`
    ),
    ...(facilityPreset.structure
      ? [
          chip(t('industry.setupChipRig'), rigFitSummaryLabel(resolveRigFit(plan), t)),
          chip(t('industry.setupChipTax'), `${plan.facilityTaxPct ?? 0}%`),
        ]
      : []),
    chip(t('industry.tradeHub'), hub.systemName),
    chip(
      t('industry.materialPriceBasis'),
      materialPriceBasisOf(plan.materialPriceBasis) === 'buy'
        ? t('industry.materialPriceBasisBuy')
        : t('industry.materialPriceBasisSell')
    ),
  ];

  return (
    <div className="space-y-4">
      {result && !error && (
        <PlanVerdictHero
          result={result}
          pricesReady={pricesReady}
          pricesLoading={pricesLoading}
          productName={entry.productName}
          productTypeID={entry.productTypeID}
          itemMenuFor={itemMenuFor}
          itemActionsFor={itemActionsFor}
          runs={plan.runs}
          bpcCoverage={bpcCoverage}
          blueprintName={nameForType(catalog, plan.blueprintTypeID)}
          onSetRuns={(runs) => update({ runs })}
          ownedSale={ownedSale}
          breakdown={breakdownContext}
          breakdownOpen={breakdownOpen}
          onBreakdownOpenChange={setBreakdownOpen}
          onLogProduction={() => setLogRequest((n) => n + 1)}
          logProductionDisabled={entry.productTypeID === null}
          skillGate={topLevelSkillGate}
          nameForSkill={(typeID) => nameForType(catalog, typeID)}
          nameForCharacter={(characterId) => characterNames.get(characterId) ?? t('common.unknown')}
          slotLine={
            <PlanSlotLine
              characterId={plan.characterId}
              category={categoryForActivity(activity)}
              seconds={result.seconds}
            />
          }
        />
      )}
      {result && !error && result.revenue !== null && (
        <AssumesBaseStandingsNote
          characterId={plan.characterId}
          hint={t('industry.assumesBaseStandingsHint')}
        />
      )}

      <Panel
        title={t('industry.setup')}
        actions={
          <Button size="sm" aria-expanded={setupOpen} onClick={() => setSetupOpen((open) => !open)}>
            {setupOpen ? (
              <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            ) : (
              <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" />
            )}
            {setupOpen ? t('industry.setupDone') : t('industry.setupEdit')}
          </Button>
        }
      >
        {setupOpen ? (
          <div className="space-y-4">
            <div>
              <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('industry.groupBlueprint')}
              </h3>
              {bpcCoverage && (
                <div className="mt-2">
                  <BpcCoverageWarning
                    coverage={bpcCoverage}
                    blueprintName={nameForType(catalog, plan.blueprintTypeID)}
                    onSetRuns={(runs) => update({ runs })}
                  />
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs">
                  {t('industry.runs')}
                  <SourcingInput
                    value={plan.runs}
                    label={t('industry.runs')}
                    inputMode="numeric"
                    widthClassName="w-full"
                    // Blank/garbage reverts to the last committed value rather than
                    // snapping to the minimum — clearing the box to retype "10" as
                    // "100" must not overwrite it with 1 mid-edit.
                    parse={(raw) => parseOrKeep(plan.runs, raw, (n) => Math.max(1, Math.round(n)))}
                    onCommit={(runs) => update({ runs })}
                  />
                </label>

                {/*
                ME/TE are no longer pilot-set fields (issue #838): the
                Blueprint Acquisition tier picker resolves them — whichever
                owned or purchasable tier is cheapest overall — and the
                setup chips above show the result. A pilot who sources a
                copy the app cannot see still overrides its price the way
                any material's price is overridden (#839 will add a picker
                for choosing among multiple owned instances).
              */}
              </div>
            </div>

            <div>
              <h3 className="flex items-center justify-between gap-2 border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('industry.groupLocationMarket')}
                <GroupTargetLink
                  plan={plan}
                  snapshot={groupSnapshot}
                  onApply={() => groupSnapshot && update(retargetPatch(groupSnapshot))}
                />
              </h3>
              <div className="mt-2 flex flex-col gap-3">
                <BuildLocationPicker
                  activity={activity}
                  summary={t('industry.buildLocationSummary', {
                    facility: facilityPreset.name,
                    system: buildSystem?.name ?? hub.systemName,
                    security: t(`industry.${plan.security}`),
                  })}
                  selectedLabel={buildLocationName}
                  onPick={(option) => update(buildLocationPatch(option))}
                >
                  <label className="flex flex-col gap-1 text-xs">
                    {t('industry.facility')}
                    <Select
                      value={plan.facility}
                      onValueChange={(value) => {
                        const facility = value as FacilityKind;
                        const structure = FACILITY_PRESETS[facility].structure;
                        update({
                          facility,
                          ...clearedBuildLocation,
                          ...(structure
                            ? {}
                            : { rigFit: EMPTY_RIG_FIT, facilityTaxPct: undefined }),
                        });
                      }}
                    >
                      <SelectTrigger aria-label={t('industry.facility')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Only facilities that can actually run this plan's
                          activity — an Athanor can't manufacture, a Raitaru
                          can't react (issue #460). */}
                        {Object.values(FACILITY_PRESETS)
                          .filter((f) => f.activity === activity)
                          .map((f) => (
                            <SelectItem key={f.kind} value={f.kind}>
                              {f.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <BuildSystemInput
                    systemName={buildSystem?.name}
                    hubSystemName={hub.systemName}
                    securityLabel={t(`industry.${plan.security}`)}
                    onChange={(system) =>
                      update({
                        buildSystemId: system?.id,
                        buildSystemName: system?.name,
                        ...clearedBuildLocation,
                        // The band follows the system, so naming one settles the
                        // rig multiplier too. An unreachable ESI leaves the plan
                        // with the band it had rather than a guessed one.
                        ...(system === null
                          ? { security: hub.security }
                          : system.security !== null
                            ? { security: system.security }
                            : {}),
                      })
                    }
                  />
                </BuildLocationPicker>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {/* Only a player structure has rig slots or an owner-set tax, so an
                    NPC station shows neither rather than showing them dead. Both
                    are already cleared on the plan when the facility changes. */}
                  {facilityPreset.structure && (
                    <div className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-3">
                      <span>{t('industry.rigFitLabel')}</span>
                      <div className="flex flex-wrap gap-2">
                        {resolveRigFit(plan).map((kind, slot) => (
                          // A slot's position is its identity, not the kind
                          // fitted in it, so the index is a stable key.
                          <label key={slot} className="flex flex-col gap-1">
                            <span className="sr-only">
                              {t('industry.rigSlotLabel', { slot: slot + 1 })}
                            </span>
                            <Select
                              value={kind}
                              onValueChange={(value) =>
                                update({
                                  rigFit: setRigSlot(resolveRigFit(plan), slot, value as RigKind),
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label={t('industry.rigSlotLabel', { slot: slot + 1 })}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RIG_KIND_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {t(rigKindLabelKey(option))}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {facilityPreset.structure && (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="flex items-center gap-1">
                        <label htmlFor="build-plan-facility-tax">{t('industry.facilityTax')}</label>
                        <InfoTooltip
                          label={t('industry.facilityTaxTooltipLabel')}
                          content={t('industry.facilityTaxTooltip')}
                        />
                      </span>
                      <TextInput
                        id="build-plan-facility-tax"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={plan.facilityTaxPct ?? 0}
                        onChange={(e) =>
                          update({ facilityTaxPct: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </div>
                  )}

                  <label className="flex flex-col gap-1 text-xs">
                    {t('industry.tradeHub')}
                    <Select
                      value={plan.hubId}
                      onValueChange={(value) =>
                        update({ hubId: value as BuildPlanRecord['hubId'] })
                      }
                    >
                      <SelectTrigger aria-label={t('industry.tradeHub')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRADE_HUBS.map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  {/* Sits under Trade hub because it names a side of that hub's
                    order book, not a separate place. Materials only — the
                    product stays on lowest sell, which is what buying it
                    outright costs (CONTEXT.md, Acquisition Verdict). */}
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="flex items-center gap-1">
                      <label htmlFor="build-plan-material-price-basis">
                        {t('industry.materialPriceBasis')}
                      </label>
                      <InfoTooltip
                        label={t('industry.materialPriceBasisTooltipLabel')}
                        content={t('industry.materialPriceBasisTooltip')}
                      />
                    </span>
                    <Select
                      value={materialPriceBasisOf(plan.materialPriceBasis)}
                      onValueChange={(value) =>
                        update({ materialPriceBasis: value as MaterialPriceBasis })
                      }
                    >
                      <SelectTrigger
                        id="build-plan-material-price-basis"
                        aria-label={t('industry.materialPriceBasis')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sell">{t('industry.materialPriceBasisSell')}</SelectItem>
                        <SelectItem value="buy">{t('industry.materialPriceBasisBuy')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* A reaction-activity plan never shows this: it reuses its own
                  top-level facility/rig/security for a nested reaction
                  sub-build instead (issue #698). */}
                {activity === 'manufacturing' && (
                  <div className="flex flex-col gap-3 border-t border-line pt-3">
                    <span className="flex items-center gap-2 text-xs">
                      <Checkbox
                        id="build-plan-include-reactions"
                        checked={includeReactions}
                        onChange={(e) => toggleIncludeReactions(e.target.checked)}
                      />
                      <label htmlFor="build-plan-include-reactions">
                        {t('industry.includeReactions')}
                      </label>
                      <InfoTooltip
                        label={t('industry.includeReactionsTooltipLabel')}
                        content={t('industry.includeReactionsTooltip')}
                      />
                    </span>

                    {includeReactions && (
                      <>
                        <BuildLocationPicker
                          activity="reaction"
                          idPrefix="build-plan-reaction-location"
                          labelKey="industry.reactionLocation"
                          summary={t('industry.buildLocationSummary', {
                            facility: FACILITY_PRESETS[plan.reactionFacility ?? 'athanor'].name,
                            system:
                              reactionBuildSystem?.name ?? t('industry.reactionLocationNotSet'),
                            security: t(`industry.${plan.reactionSecurity ?? 'highsec'}`),
                          })}
                          selectedLabel={reactionBuildLocationName}
                          onPick={(option) => update(reactionBuildLocationPatch(option))}
                        >
                          <label className="flex flex-col gap-1 text-xs">
                            {t('industry.facility')}
                            <Select
                              value={plan.reactionFacility ?? 'athanor'}
                              onValueChange={(value) =>
                                update({
                                  reactionFacility: value as FacilityKind,
                                  ...clearedReactionBuildLocation,
                                })
                              }
                            >
                              <SelectTrigger aria-label={t('industry.facility')}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Reaction-capable structures only — an
                                  engineering complex cannot host a reaction. */}
                                {REACTION_FACILITY_PRESETS.map((f) => (
                                  <SelectItem key={f.kind} value={f.kind}>
                                    {f.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>

                          <BuildSystemInput
                            idPrefix="build-plan-reaction-system"
                            systemName={reactionBuildSystem?.name}
                            hubSystemName={t('industry.reactionLocationNotSet')}
                            securityLabel={t(`industry.${plan.reactionSecurity ?? 'highsec'}`)}
                            onChange={(system) =>
                              update({
                                reactionBuildSystemId: system?.id,
                                reactionBuildSystemName: system?.name,
                                ...clearedReactionBuildLocation,
                                ...(system === null
                                  ? { reactionSecurity: 'highsec' }
                                  : system.security !== null
                                    ? { reactionSecurity: system.security }
                                    : {}),
                              })
                            }
                          />
                        </BuildLocationPicker>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-3">
                            <span>{t('industry.rigFitLabel')}</span>
                            <div className="flex flex-wrap gap-2">
                              {resolveRigFit({ rigFit: plan.reactionRigFit }).map((kind, slot) => (
                                <label key={slot} className="flex flex-col gap-1">
                                  <span className="sr-only">
                                    {t('industry.rigSlotLabel', { slot: slot + 1 })}
                                  </span>
                                  <Select
                                    value={kind}
                                    onValueChange={(value) =>
                                      update({
                                        reactionRigFit: setRigSlot(
                                          resolveRigFit({ rigFit: plan.reactionRigFit }),
                                          slot,
                                          value as RigKind
                                        ),
                                      })
                                    }
                                  >
                                    <SelectTrigger
                                      aria-label={t('industry.rigSlotLabel', { slot: slot + 1 })}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {RIG_KIND_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                          {t(rigKindLabelKey(option))}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 text-xs">
                            <span className="flex items-center gap-1">
                              <label htmlFor="build-plan-reaction-facility-tax">
                                {t('industry.facilityTax')}
                              </label>
                              <InfoTooltip
                                label={t('industry.facilityTaxTooltipLabel')}
                                content={t('industry.facilityTaxTooltip')}
                              />
                            </span>
                            <TextInput
                              id="build-plan-reaction-facility-tax"
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={plan.reactionFacilityTaxPct ?? 0}
                              onChange={(e) =>
                                update({
                                  reactionFacilityTaxPct: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">{setupChips}</div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Panel
          title={t('industry.materials')}
          actions={
            // `flex-wrap` because this is the one converted toolbar that needs a
            // saved build plan to reach, so it is the one I could not screenshot
            // at 390px. Five items — badge, three controls, duration — beside the
            // panel title, since the shopping-list copy joined the row; if they
            // ever do run out of room, wrapping inside the (min-height, not
            // fixed) header beats clipping.
            <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-dim">
              {fetchedAt && <DataAgeBadge date={fetchedAt} />}
              {/*
              Gated on there being a remainder to order, not on the table
              having rows: a plan whose every material is already owned still
              renders a full table, and the list it would copy is empty.
            */}
              <IconButton
                size="sm"
                icon={
                  copyState === 'copied' ? (
                    <Icon.Done />
                  ) : copyState === 'failed' ? (
                    <Icon.Warn />
                  ) : (
                    <Icon.CopyToClipboard />
                  )
                }
                // Both outcomes change the glyph as well as the tone, so neither
                // is carried by colour alone (docs/DESIGN.md §7).
                tone={copyState === 'failed' ? 'danger' : 'default'}
                label={
                  copyState === 'copied'
                    ? t('industry.copyShoppingListDone')
                    : copyState === 'failed'
                      ? t('industry.copyShoppingListFailed')
                      : t('industry.copyShoppingList')
                }
                onClick={() => void copyShoppingList()}
                disabled={!!error || !result || !hasShoppingList(shoppingMaterials)}
              />
              <IconButton
                size="sm"
                icon={<Icon.Download />}
                label={t('industry.exportCsvMaterials')}
                onClick={exportMaterialsCsv}
                disabled={!!error || !result || shoppingMaterials.length === 0}
              />
              <IconButton
                size="sm"
                icon={<Icon.Refresh />}
                label={t('industry.refresh')}
                onClick={() => setRefreshTick((v) => v + 1)}
              />
              {result && <span className="tabular-nums">{formatDuration(result.seconds)}</span>}
            </span>
          }
        >
          {error || !result ? (
            <p className="text-xs text-danger">{error ?? t('industry.computeError')}</p>
          ) : (
            <>
              {/* Reactions are exempt from every time implant — nothing to assume. */}
              {activity !== 'reaction' && (
                <ImplantsAssumedNote hint={t('industry.assumesNoImplantsHint')} />
              )}
              {/*
              Lives here, not in the settings block above: it governs one number
              in one column of the table below it — the owned quantity "use
              detected" offers — and nothing else on the plan. Beside Facility
              and Trade hub it read as another thing about where the job runs.
            */}
              <div className="mb-3 flex flex-col gap-3">
                <BuildPlanAutoBuildControl
                  maxDepth={autoBuildMaxDepth}
                  scope={craftScopeList}
                  disabled={!makeOrBuyContext}
                  onApply={applyAutoBuild}
                />
                <OwnedStockScopeControl
                  scope={plan.ownedStockScope}
                  detectedStock={detectedStock}
                  detection={detection}
                  onChange={(ownedStockScope) => update({ ownedStockScope })}
                  corpAssetsToggle={
                    <span className="flex items-center gap-1">
                      <FilterChip
                        label={t('industry.includeCorpAssets')}
                        selected={plan.includeCorpAssets ?? false}
                        disabled={!corpOwnedStock.available}
                        onToggle={() =>
                          update({ includeCorpAssets: !(plan.includeCorpAssets ?? false) })
                        }
                      />
                      <InfoTooltip
                        label={t('industry.includeCorpAssetsTooltipLabel')}
                        content={
                          corpOwnedStock.available
                            ? t('industry.includeCorpAssetsTooltip')
                            : t('industry.includeCorpAssetsUnavailable')
                        }
                      />
                    </span>
                  }
                  action={
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => changeSourcing(bulkDetectedPatches)}>
                        {t('industry.useAllOwned')}
                      </Button>
                      <Button size="sm" onClick={() => changeSourcing(bulkClearPatches)}>
                        {t('industry.useNoneOwned')}
                      </Button>
                    </div>
                  }
                />
              </div>
              <MaterialsTable
                materials={visibleMaterials}
                nameFor={(typeID) => nameForType(catalog, typeID)}
                volumeFor={(typeID) => volumeForType(catalog, typeID)}
                sourcing={plan.materialSourcing}
                pricesReady={pricesReady}
                onSourcingChange={changeOneSourcing}
                detection={detection}
                rowContextMenu={materialContextMenu}
                rowActions={materialActionsFor}
                makeOrBuy={materialAdvice}
                canBuildHere={canBuildHere}
                onToggleBuildHere={toggleBuildHere}
                onShowRecipe={setRecipeTypeId}
                onOpenAcquisitionPicker={setAcquisitionPickerTypeId}
                skillGates={skillGates}
                characterNameFor={detection.characterNameFor}
              />
              <BuildRecipeModal
                recipe={openRecipe}
                onClose={() => setRecipeTypeId(null)}
                nameFor={(typeID) => nameForType(catalog, typeID)}
                onOpenRecipe={setRecipeTypeId}
                itemMenuFor={itemMenuFor}
                itemActionsFor={itemActionsFor}
              />
              {acquisitionPickerTypeId !== null && (
                <BlueprintAcquisitionModal
                  onClose={() => setAcquisitionPickerTypeId(null)}
                  characterId={plan.characterId}
                  blueprintTypeID={acquisitionPickerTypeId}
                  blueprintName={nameForType(catalog, acquisitionPickerTypeId)}
                  itemMenuFor={itemMenuFor}
                  itemActionsFor={itemActionsFor}
                  ownedCopies={acquisitionPickerOwnedCopies}
                  sourcing={plan.materialSourcing?.[acquisitionPickerTypeId]}
                  onSourcingChange={changeOneSourcing}
                  onSearchBpcSourcing={onSearchBpcSourcing}
                  planHubId={plan.hubId}
                />
              )}
              {/*
              What building the chosen material(s) actually costs — already
              folded into the Results panel's totals below, at whatever depth
              they were built to (docs/context/decisions, since superseded:
              the two panels used to disagree the moment a build was
              toggled). The "buying instead" comparison only appears when
              every built material genuinely has a hub price to compare
              against; silently pricing an unsold item as free was the bug
              this replaces.
            */}
              {anySubBuilds && (
                <p className="mt-3 border-t border-line pt-2 text-[0.6875rem] text-text-dim">
                  {/*
                    Counted over the plan's own materials, not over every
                    built row in the flat table: `subBuildTotal` and the
                    "buying them instead" comparison beside it are both
                    top-level sums, and a count of a different set in the same
                    sentence reads as a count of those. What the deeper jobs
                    cost is inside the total already.
                  */}
                  {t('industry.subBuildSummary', {
                    count: builtTopLevel.length,
                    total: formatIsk(subBuildTotal),
                  })}{' '}
                  {buyInsteadTotal !== null &&
                    t('industry.subBuildSummaryComparison', {
                      planned: formatIsk(buyInsteadTotal),
                    })}{' '}
                  {t('industry.subBuildTimeNote', { time: formatDuration(subBuildTimeSeconds) })}
                </p>
              )}
            </>
          )}
        </Panel>

        {result && !error && (
          <CollapsiblePanel
            title={t('industry.costsAndRevenue')}
            /*
             * Folded, this panel is the whole verdict in three numbers: what
             * the job costs, what it brings in, and the difference. In the
             * body rather than beside the title — three figures crowd a title
             * that already sits next to two header buttons, and wrapped under
             * them. Total cost alone, which the header used to carry open or
             * closed, answered half the question and repeated a number the
             * open table states anyway.
             */
            /*
             * These three figures stay on `formatIsk` at full precision,
             * deliberately (issue #948): collapsed or open, this panel is the
             * Costs & revenue ledger, and the same number must not read
             * "1.3B" folded and "1,284,500,000" unfolded. The shorthand read
             * of profit lives in `PlanVerdictHero` above.
             */
            collapsedSummary={
              pricesReady && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-text-dim">{t('industry.totalCost')}</dt>
                  <dd className="text-right tabular-nums">{formatIsk(result.totalCost)}</dd>
                  {result.revenue !== null && (
                    <>
                      <dt className="text-text-dim">{t('industry.revenue')}</dt>
                      <dd className="text-right tabular-nums">{formatIsk(result.revenue)}</dd>
                    </>
                  )}
                  {result.profit !== null && (
                    <>
                      {/*
                        The rule is on the row itself rather than an element
                        between the rows: a bare separator child of a `<dl>` is
                        neither a term nor a definition, and a border-top on
                        both cells of the last pair draws the same line across
                        the full width without inventing one.

                        Green or red on the figure, and it is the only coloured
                        thing here: sign is what a reader is actually scanning
                        for, and the `-` in front of it carries the same meaning
                        for anyone who cannot see the difference
                        (docs/DESIGN.md §7).
                      */}
                      <dt className="border-t border-line pt-1 text-text-dim">
                        {t('industry.netProfit')}
                      </dt>
                      <dd
                        className={cx(
                          'border-t border-line pt-1 text-right tabular-nums',
                          result.profit < 0 ? 'text-isk-neg' : 'text-isk-pos'
                        )}
                      >
                        {formatIsk(result.profit)}
                      </dd>
                    </>
                  )}
                </dl>
              )
            }
            expanded={costsExpanded}
            onToggle={() => setCostsOpen(!costsExpanded)}
            labels={{ show: t('industry.showDetails'), hide: t('industry.hideDetails') }}
            actions={
              <IconButton
                size="sm"
                icon={<Icon.Info />}
                label={t('industry.breakdownTrigger')}
                onClick={() => setBreakdownOpen(true)}
              />
            }
          >
            <ResultsSummary
              result={result}
              pricesReady={pricesReady}
              pricesLoading={pricesLoading}
              systemCostIndex={snapshot?.systemCostIndex ?? null}
              productName={entry.productName}
              productTypeID={entry.productTypeID}
              productUnitPrice={productUnitPrice}
              productQuantity={productQuantity}
              costIndexSystemName={buildSystem?.name ?? hub.systemName}
              ownedSale={ownedSale}
              nameFor={(typeID) => nameForType(catalog, typeID)}
              totalVolume={materialVolume}
              itemMenuFor={itemMenuFor}
              itemActionsFor={itemActionsFor}
              onOpenBreakdown={() => setBreakdownOpen(true)}
            />
          </CollapsiblePanel>
        )}
      </div>

      <ProductionRunsPanel
        characterId={plan.characterId}
        buildPlanId={plan.id}
        defaults={
          result
            ? {
                quantity: productQuantity ?? 0,
                materialCost: result.materialCost,
                jobFee: result.jobFee.total,
              }
            : null
        }
        productTypeID={entry.productTypeID}
        productName={entry.productName}
        skills={modifiers.skills}
        standing={standing}
        logRequest={logRequest}
      />
      {copyState === 'copied' && blueprintsLeftOut > 0 && (
        <Toast
          message={t('industry.copyShoppingListBlueprintsLeftOut', { count: blueprintsLeftOut })}
        />
      )}
    </div>
  );
}
