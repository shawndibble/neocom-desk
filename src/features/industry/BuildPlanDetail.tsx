import { useEffect, useMemo, useState, type ReactElement } from 'react';
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
import {
  autoBuildHere,
  maxAutoBuildDepth,
  type BuildStrategy,
} from '@/engine/industry/autoMakeOrBuy';
import { craftScope } from '@/engine/industry/craftScope';
import { ownedStockSale } from '@/engine/industry/ownedStockSale';
import type {
  FacilityKind,
  MaterialPriceBasis,
  MaterialSourcing,
  ReactionFacilityContext,
  RigKind,
  SkillLevels,
} from '@/engine/industry/types';
import { rigKindLabelKey, rigFitSummaryLabel } from './rigFitLabels';
import type { BuildGroupSnapshot } from './buildGroups';
import { GroupTargetLink } from './GroupTargetLink';
import {
  facilityContextFor,
  reactionPlanFacilityContextFor,
  autoBuildDepthContext,
} from './planFacilityContext';
import { useReactionFacilityDefaults } from './reactionFacilityDefaults';
import { retargetPatch } from './retargetPatch';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';
import { computeBuildPlan } from './computeBuildPlan';
import { buildPlanTypeIds, recipeForLookup } from './recipes';
import { materialPriceBasisOf, materialPricesFor } from './priceBasis';
import { useMarketSnapshot } from './useMarketSnapshot';
import { formatDuration } from '@/lib/duration';
import { downloadCsv } from '@/lib/downloadCsv';
import { writeToClipboard } from '@/lib/clipboard';
import { unmaskNumber } from '@/lib/numberMask';
import { MaterialsTable, SourcingInput } from './MaterialsTable';
import { BuildRecipeModal } from './BuildRecipeModal';
import { buyPricedLine } from './materialRow';
import { materialsCsvColumns } from './materialsCsv';
import { hasShoppingList, shoppingListText } from './shoppingList';
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
import {
  bulkOwnedStockSuggestions,
  clearOwnedStockSuggestions,
  filterStockByScope,
} from '@/engine/industry/ownedStock';
import {
  stockLocationLabel,
  type OwnedStockDetection,
  type OwnedStockSnapshot,
} from './ownedStockDetection';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import type { CorpOwnedStockState } from './corpOwnedStock';
import { useAssumedMe } from './assumedMe';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import { BuildPlanAutoBuildControl } from './BuildPlanAutoBuildControl';
import { ResultsSummary } from './ResultsSummary';
import { PlanVerdictHero } from './PlanVerdictHero';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { ProductionRunsPanel } from './ProductionRunsPanel';
import { BuildSystemInput } from './BuildSystemInput';
import { BuildLocationPicker } from './BuildLocationPicker';
import { buildLocationLabel } from './buildLocationLabel';
import { buildLocationPatch, reactionBuildLocationPatch } from './buildLocationPatch';
import { useDerivedSecurityBand } from './useDerivedSecurityBand';

/** The Build Plan fields this panel edits; `Industry.tsx` persists exactly these. */
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

/** One material's sourcing edit, for the bulk "use all" action. */
export interface SourcingPatchEntry {
  typeID: number;
  patch: MaterialSourcing;
}

interface BuildPlanDetailProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  /** Planetary schematics, for materials no blueprint makes. Null while pi.json loads, or if it failed. */
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  skills: SkillLevels;
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
  onUpdate: (patch: PlanPatch) => void;
  /**
   * A correction the panel derived rather than the pilot made — persisted
   * without counting as an edit, so opening a plan never bumps its
   * `updatedAt`. Today: a security band brought back into line with the
   * plan's build system.
   */
  onDerivedFix: (patch: PlanPatch) => void;
  /**
   * One material row’s sourcing edit. Separate from `onUpdate` because it is a
   * read-modify-write of a nested map rather than a whole field, so it has to
   * merge against the stored record, not against this render’s `plan`.
   */
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /**
   * Several rows' sourcing edits at once, for "use all detected". Separate from
   * `onSourcingChange` because the caller has to serialise the writes: each one
   * is a read-modify-write of the same nested map, so firing them concurrently
   * would have later ones merging into a record read before the earlier ones
   * landed.
   */
  onSourcingChangeMany: (patches: readonly SourcingPatchEntry[]) => void;
  /** Materials-row context menu (CONTEXT.md round 26) — the same actions the Market and Assets rows offer. */
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the material under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  /** This plan's group's last Retarget (issue #632), or null when ungrouped or not yet Retargeted. */
  groupSnapshot: BuildGroupSnapshot | null;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
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
  skills,
  ownedStockSnapshot,
  corpOwnedStock,
  onUpdate,
  onDerivedFix,
  onSourcingChange,
  onSourcingChangeMany,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
  groupSnapshot,
}: BuildPlanDetailProps) {
  const { t } = useTranslation();

  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID) ?? null;
  const blueprint = useMemo(() => (entry ? toIndustryBlueprint(entry.blueprint) : null), [entry]);
  const activity = blueprint ? industryActivityOf(blueprint) : 'manufacturing';
  const hub = useMemo(() => getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB, [plan.hubId]);
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

  // Pre-fills a fresh plan's Reaction Location the first time Include
  // Reactions is turned on for it (issue #698) — read here, alongside
  // `assumedMe`, so it's in hand the moment `toggleIncludeReactions` needs it
  // rather than one render behind.
  const reactionFacilityDefaults = useReactionFacilityDefaults((state) => state.value);
  const hydrateReactionFacilityDefaults = useReactionFacilityDefaults((state) => state.hydrate);
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
    onDerivedFix({ security })
  );
  // Same reconciliation for the Reaction Location. There is no hub fallback
  // for a place with no hub of its own — highsec is the same "nothing chosen
  // yet" default `reactionPlanFacilityContextFor` already assumes.
  useDerivedSecurityBand(
    reactionBuildSystem?.id,
    'highsec',
    plan.reactionSecurity ?? 'highsec',
    (security) => onDerivedFix({ reactionSecurity: security })
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

  const ownedMatch = useMemo(
    () => findOwnedBlueprint(ownedBlueprints, plan.blueprintTypeID),
    [ownedBlueprints, plan.blueprintTypeID]
  );

  /**
   * The one map every "what does this material cost to buy" on the plan reads
   * — its own cost lines, its sub-build inputs and its make-or-buy verdicts,
   * so a single plan never mixes the two sides of the book. Both sides come
   * from the snapshot already in hand, which is why the basis is deliberately
   * absent from `snapshotKey` above: toggling it must re-compute, not refetch.
   */
  const materialPrices = useMemo(
    () => materialPricesFor(snapshot, plan.materialPriceBasis),
    [snapshot, plan.materialPriceBasis]
  );

  /**
   * What produces a material — general over any typeID a `buildHere` choice
   * might reach, at any depth, not only the blueprint's own materials. Recipe
   * lookup needs no live prices, so this is available even while the market
   * snapshot is still loading, which is what keeps the build control present
   * during a slow or unreachable price fetch.
   */
  const recipeFor = useMemo(
    () => recipeForLookup({ catalog, pi, ownedBlueprints, assumedMeForUnowned: assumedMe }),
    [catalog, pi, ownedBlueprints, assumedMe]
  );

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
   * The Reaction Location, fully resolved with a live cost index — `undefined`
   * until both a facility is configured and `reactionSnapshot` has landed.
   * Fed to every engine context on this plan that needs it (`makeOrBuyContext`
   * below, `computeBuildPlan`'s own `reactionFacility`), so the manual toggle,
   * the recursive engine and the advisory marker all quote the same place.
   * Memoized so its identity is stable across renders where nothing it reads
   * changed — several `useMemo`s downstream (`makeOrBuyContext`,
   * `autoBuildMaxDepth`, the `result` computation) list it as a dependency.
   */
  const reactionFacilityContext: ReactionFacilityContext | undefined = useMemo(
    () =>
      reactionPlanFacilityContext && reactionSnapshot?.systemCostIndex != null
        ? { ...reactionPlanFacilityContext, systemCostIndex: reactionSnapshot.systemCostIndex }
        : undefined,
    [reactionPlanFacilityContext, reactionSnapshot]
  );

  const { result, error } = useMemo(() => {
    if (!blueprint) return { result: null, error: t('industry.blueprintMissing') };
    return computeBuildPlan({
      plan,
      blueprint,
      systemCostIndex: snapshot?.systemCostIndex ?? 0,
      adjustedPrices: snapshot?.adjustedPrices ?? {},
      hubPrices: snapshot?.hubPrices ?? {},
      materialPrices,
      skills,
      recipeFor,
      reactionFacility: reactionFacilityContext,
    });
  }, [plan, blueprint, snapshot, materialPrices, skills, recipeFor, reactionFacilityContext, t]);

  /**
   * Both liquidation bases at once, so the Use-or-sell toggle switches between
   * two numbers already in hand rather than re-deriving one per click. Sell-now
   * reads the buy side of the book (what a standing order pays today), sell-order
   * the sell side (what listing your own stack asks) — deliberately independent
   * of the plan's *material* price basis, which is about buying, not selling.
   */
  const ownedSale = useMemo(() => {
    if (!result || !snapshot) return null;
    return {
      instant: ownedStockSale(result.materials, snapshot.hubBuyPrices, 'instant', skills),
      order: ownedStockSale(result.materials, snapshot.hubPrices, 'order', skills),
    };
  }, [result, snapshot, skills]);

  const pricesReady =
    snapshot !== null && snapshot.adjustedPrices !== null && snapshot.systemCostIndex !== null;

  /**
   * The facility/rig/security/tax inputs every engine context on this plan
   * needs — the "where and how a job runs" half, which doesn't depend on
   * whether prices have loaded yet. Shared by `makeOrBuyContext` below and
   * `expanded`'s own `ctx`, which each then add their own pricing fields with
   * their own fallback policy (one waits for real prices, the other tolerates
   * their absence so a plan still renders while they load).
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
   * The pricing context every make-or-buy verdict on this plan needs. Null
   * until live prices land, for the same reason the results panel waits:
   * without adjusted prices and a system cost index there is no job fee, and
   * a fee-free quote would call almost everything worth building.
   */
  const makeOrBuyContext = useMemo(() => {
    if (!snapshot || snapshot.adjustedPrices === null || snapshot.systemCostIndex === null) {
      return null;
    }
    return {
      ...facilityContext,
      systemCostIndex: snapshot.systemCostIndex,
      adjustedPrices: snapshot.adjustedPrices,
      materialPrices,
      skills,
      reactionFacility: reactionFacilityContext,
    };
  }, [facilityContext, snapshot, materialPrices, skills, reactionFacilityContext]);

  /**
   * Auto Build's own depth range (issue #695): the plan's actual tree
   * depth, independent of whether live prices have loaded — depth discovery
   * never prices anything, so gating it on `makeOrBuyContext` (null until
   * `pricesReady`) would leave Apply disabled during a slow price
   * fetch for no reason. Built from `reactionPlanFacilityContext`, not the
   * price-resolved `reactionFacilityContext` below: the latter stays
   * `undefined` until its own market snapshot lands, which would understate
   * this plan's depth for as long as that fetch is in flight whenever a
   * Reaction Location is configured. `autoBuildDepthContext` is the same seam
   * `autoBuildGroup.ts`'s per-member depth walk uses.
   */
  const autoBuildMaxDepth = useMemo(() => {
    if (!blueprint) return 0;
    return maxAutoBuildDepth(blueprint, plan.me, {
      recipeFor,
      ctx: autoBuildDepthContext(facilityContext, reactionPlanFacilityContext, skills),
      runs: plan.runs,
    });
  }, [
    blueprint,
    plan.me,
    plan.runs,
    recipeFor,
    facilityContext,
    skills,
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

  // Every material on the table, not just the blueprint's own: a mineral a
  // sub-build introduced is as ownable as anything else, and while this was
  // the blueprint's material list a player with 10,714,573 Tritanium in the
  // hangar was told they owned none of it the moment the Tritanium row came
  // from a component's recipe rather than the ship's.
  //
  // Still keyed off content, not array identity. `detectOwnedStock` scans
  // every Character's whole asset list — tens of thousands of rows — so it
  // must not re-run on a runs/ME/TE keystroke, and `visibleMaterials` is a
  // fresh array on each of those. The joined id list is the real dependency:
  // it changes when a build is toggled (which does add and remove rows) and
  // not when a number beside one is edited.
  const materialTypeIdKey = useMemo(
    () =>
      [...new Set(visibleMaterials.map((material) => material.typeID))]
        .sort((a, b) => a - b)
        .join(','),
    [visibleMaterials]
  );
  const materialTypeIds = useMemo(
    () => (materialTypeIdKey === '' ? [] : materialTypeIdKey.split(',').map(Number)),
    [materialTypeIdKey]
  );
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

  // Narrowed to the plan's owned-stock scope (issue #454); `detectedStock`
  // itself stays the full, galaxy-wide picture the breakdown popover shows.
  const scopedStock = useMemo(
    () => filterStockByScope(detectedStock, plan.ownedStockScope),
    [detectedStock, plan.ownedStockScope]
  );

  // The corp source's own incompleteness (a capped/missing asset page) folds
  // in only while it's actually contributing — an untoggled or unavailable
  // corp source has nothing to be incomplete about.
  const allIncompleteCharacters = useMemo(
    () =>
      includeCorpAssets && corpOwnedStock.incomplete && corpOwnedStock.corporationName
        ? [...incompleteCharacters, corpOwnedStock.corporationName]
        : incompleteCharacters,
    [
      incompleteCharacters,
      includeCorpAssets,
      corpOwnedStock.incomplete,
      corpOwnedStock.corporationName,
    ]
  );

  const detection = useMemo<OwnedStockDetection>(
    () => ({
      stockFor: (typeID) => detectedStock.get(typeID),
      scopedQuantityFor: (typeID) => scopedStock.get(typeID)?.quantity ?? 0,
      lowerBound: allIncompleteCharacters.length > 0,
      incompleteCharacters: allIncompleteCharacters,
      characterNameFor: (characterId) => characterNames.get(characterId) ?? t('common.unknown'),
      corporationNameFor: () => corpOwnedStock.corporationName ?? t('common.unknown'),
      locationLabelFor: (placement) => stockLocationLabel(placement, locationNames, t),
    }),
    [
      detectedStock,
      scopedStock,
      characterNames,
      locationNames,
      allIncompleteCharacters,
      corpOwnedStock.corporationName,
      t,
    ]
  );

  // "Use all" fills only rows with nothing typed in them: a
  // hand-entered value, including a deliberate 0, is never clobbered by a bulk
  // action. The per-row action is the one that overwrites — clicking it on that
  // row means it.
  //
  // Over every row on the table, not the blueprint's own materials: the bulk
  // action has to reach exactly what the per-row offers reach, or "use all"
  // silently skips every mineral a sub-build introduced while the row beside
  // it is still offering to apply one.
  const bulkDetectedPatches = useMemo<SourcingPatchEntry[]>(
    () =>
      bulkOwnedStockSuggestions(visibleMaterials, plan.materialSourcing, scopedStock).map(
        ({ typeID, ownedQuantity }) => ({ typeID, patch: { ownedQuantity } })
      ),
    [visibleMaterials, plan.materialSourcing, scopedStock]
  );

  // "Use none" is the reverse of "use all": it zeroes every row currently
  // carrying a non-zero owned quantity, hand-typed or bulk-filled alike
  // (issue #612) — a deliberate clobber, not the "only untouched rows" rule
  // above.
  const bulkClearPatches = useMemo<SourcingPatchEntry[]>(
    () =>
      clearOwnedStockSuggestions(visibleMaterials, plan.materialSourcing).map(
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
    const timer = setTimeout(() => setCopyState(null), 2000);
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
    onUpdate(patch);
  }

  /**
   * Switches one material between being bought and being produced here.
   *
   * The whole list is rewritten rather than the single entry toggled in place,
   * because it is a plain field on the record — unlike `materialSourcing`,
   * which is a nested map and so needs the read-modify-write path
   * `onSourcingChange` takes.
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
    const picked = autoBuildHere(blueprint, plan.me, {
      recipeFor,
      ctx: makeOrBuyContext,
      depth: autoBuildMaxDepth,
      runs: plan.runs,
      scope: craftScopeList,
      strategy: options.strategy,
    });
    update({ buildHere: [...picked] });
  }

  /**
   * Unlike Market/Assets, this page already holds the whole blueprint catalog
   * (it needs it to render the plan at all), so the "Build Plan" action
   * resolves synchronously — never the `undefined` "checking…" state those
   * lazily-loading callers pass. For a material something else manufactures
   * the action lands back here with `?product=`, creating or selecting that
   * material's own plan so its build-vs-buy read can be compared with this one.
   */
  function materialContextMenu(material: MaterialTableRow, tr: ReactElement) {
    const name = nameForType(catalog, material.typeID);
    const buildable = canBuildHere(material.typeID);
    return (
      <ItemContextMenu
        typeId={material.typeID}
        itemName={name}
        blueprintTypeID={catalog.byProductTypeID.get(material.typeID)?.blueprintTypeID ?? null}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
        onToggleBuildHere={buildable ? () => toggleBuildHere(material.typeID) : undefined}
        buildingHere={material.subBuilds.length > 0}
      >
        {tr}
      </ItemContextMenu>
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
    me: plan.me,
    isReaction: activity === 'reaction',
    accountingLevel: skills[SKILL_IDS.accounting] ?? 0,
    brokerRelationsLevel: skills[SKILL_IDS.brokerRelations] ?? 0,
    systemCostIndex: snapshot?.systemCostIndex ?? null,
    costIndexSystemName: buildSystem?.name ?? hub.systemName,
    productName: entry.productName,
    productQuantity: blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null,
    productUnitPrice:
      entry.productTypeID !== null ? (snapshot?.hubPrices[entry.productTypeID] ?? null) : null,
  };

  const chip = (label: string, value: string) => (
    <StatChip key={label} label={label} value={value} />
  );
  const setupChips = [
    chip(t('industry.runs'), plan.runs.toLocaleString()),
    ...(activity === 'manufacturing'
      ? [
          chip(t('industry.setupChipMe'), `${plan.me}%`),
          chip(t('industry.setupChipTe'), `${plan.te}%`),
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
          runs={plan.runs}
          ownedSale={ownedSale}
          breakdown={breakdownContext}
          breakdownOpen={breakdownOpen}
          onBreakdownOpenChange={setBreakdownOpen}
          onLogProduction={() => setLogRequest((n) => n + 1)}
          logProductionDisabled={entry.productTypeID === null}
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
                Reaction formulas carry no material/time efficiency — the SDE
                has no research activity for any of them (issue #460), so
                they always run at 0/0 and the fields have nothing to edit.
              */}
                {activity === 'manufacturing' && (
                  <>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="flex items-center gap-1">
                        <label htmlFor="build-plan-me">{t('industry.me')}</label>
                        <InfoTooltip
                          label={t('industry.meTooltipLabel')}
                          content={t('industry.meTooltip')}
                        />
                      </span>
                      <SourcingInput
                        id="build-plan-me"
                        value={plan.me}
                        label={t('industry.me')}
                        inputMode="numeric"
                        widthClassName="w-full"
                        parse={(raw) => parseOrKeep(plan.me, raw, (n) => clampInt(n, 0, 10))}
                        onCommit={(me) => update({ me })}
                      />
                      {ownedMatch && (
                        <span className="text-[0.6875rem] text-text-dim">
                          {t('industry.ownedHint', {
                            me: ownedMatch.material_efficiency,
                            te: ownedMatch.time_efficiency,
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 text-xs">
                      <span className="flex items-center gap-1">
                        <label htmlFor="build-plan-te">{t('industry.te')}</label>
                        <InfoTooltip
                          label={t('industry.teTooltipLabel')}
                          content={t('industry.teTooltip')}
                        />
                      </span>
                      <SourcingInput
                        id="build-plan-te"
                        value={plan.te}
                        label={t('industry.te')}
                        inputMode="numeric"
                        widthClassName="w-full"
                        parse={(raw) => parseOrKeep(plan.te, raw, (n) => clampInt(n, 0, 20))}
                        onCommit={(te) => update({ te })}
                      />
                    </div>
                  </>
                )}
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
                      <input
                        id="build-plan-include-reactions"
                        type="checkbox"
                        checked={includeReactions}
                        onChange={(e) => toggleIncludeReactions(e.target.checked)}
                        className="size-4 shrink-0 cursor-pointer accent-accent"
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
                                {Object.values(FACILITY_PRESETS)
                                  .filter((f) => f.activity === 'reaction')
                                  .map((f) => (
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
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
                    (bulkDetectedPatches.length > 0 || bulkClearPatches.length > 0) && (
                      <div className="flex gap-2">
                        {bulkDetectedPatches.length > 0 && (
                          <Button
                            size="sm"
                            onClick={() => onSourcingChangeMany(bulkDetectedPatches)}
                          >
                            {t('industry.useAllOwned')}
                          </Button>
                        )}
                        {bulkClearPatches.length > 0 && (
                          <Button size="sm" onClick={() => onSourcingChangeMany(bulkClearPatches)}>
                            {t('industry.useNoneOwned')}
                          </Button>
                        )}
                      </div>
                    )
                  }
                />
              </div>
              <MaterialsTable
                materials={visibleMaterials}
                nameFor={(typeID) => nameForType(catalog, typeID)}
                sourcing={plan.materialSourcing}
                pricesReady={pricesReady}
                onSourcingChange={onSourcingChange}
                detection={detection}
                rowContextMenu={materialContextMenu}
                makeOrBuy={materialAdvice}
                canBuildHere={canBuildHere}
                onToggleBuildHere={toggleBuildHere}
                onShowRecipe={setRecipeTypeId}
              />
              <BuildRecipeModal
                recipe={openRecipe}
                onClose={() => setRecipeTypeId(null)}
                nameFor={(typeID) => nameForType(catalog, typeID)}
                onOpenRecipe={setRecipeTypeId}
              />
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
        skills={skills}
        logRequest={logRequest}
      />
    </div>
  );
}
