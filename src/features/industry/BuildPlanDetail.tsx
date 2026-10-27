import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { tappableRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CollapsiblePanel,
  DataAgeBadge,
  EmptyState,
  IconButton,
  InfoTooltip,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  LiveStatus,
  Toast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Collapse } from '@/components/ui/Collapse';
import {
  FACILITY_PRESETS,
  RIG_KIND_OPTIONS,
  SKILL_IDS,
  EMPTY_RIG_FIT,
  industryActivityOf,
  resolveRigFit,
  setRigSlot,
} from '@/engine/industry/types';
import { groupStockClaims, type GroupClaimMember } from '@/engine/industry/groupStockClaims';
import {
  autoBuildHere,
  maxAutoBuildDepth,
  type BuildStrategy,
} from '@/engine/industry/autoMakeOrBuy';
import { craftScope } from '@/engine/industry/craftScope';
import { planOwnedStockSale, type LiquidationBasis } from '@/engine/industry/ownedStockSale';
import { profitOnBasis, type ProfitBasis } from '@/engine/industry/profitBasis';
import { productSellNow } from '@/engine/industry/productSellNow';
import { securityBand } from '@/engine/securityStatus';
import type { FacilityKind, MaterialPriceBasis, RigKind } from '@/engine/industry/types';
import { rigKindLabelKey } from './rigFitLabels';
import { RigMatchHelper } from './RigMatchHelper';
import type { BuildPlanChange } from './buildPlanStore';
import type { BuildGroup, BuildGroupSnapshot } from './buildGroups';
import { GroupTargetLink } from './GroupTargetLink';
import {
  facilityContextFor,
  reactionPlanFacilityContextFor,
  autoBuildDepthContext,
} from './planFacilityContext';
import { moveSaving } from '@/engine/industry/moveSaving';
import { REACTION_FACILITY_PRESETS } from './reactionFacilityDefaults';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { hydrateActivityFacilityDefaults } from './facilityDefaults';
import { applyCostIndexOverride, costIndexSource, parseCostIndexPct } from './costIndexOverride';
import { facilityMemoryKey, patchFromMemory, recallFacility } from './facilityMemory';
import { retargetPatch } from './retargetPatch';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import type { BuildPlanRecord } from '@/db';
import type { JobProductionSeed } from './logProductionFromJob';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import {
  evaluateSkillGate,
  mergeSkillGates,
  type SkillGateVerdict,
} from '@/engine/industry/skillGate';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import {
  nameForType,
  toIndustryBlueprint,
  volumeForType,
  type BlueprintCatalog,
} from './blueprintCatalog';
import { breakEvenRuns } from '@/engine/industry/breakEvenRuns';
import { inventionPricingContextFor, planOwnedBlueprints } from './resolveBuildPlan';
import { inventionQuoteFor } from './inventionSources';
import { buildPlanTypeIds, recipeForLookup } from './recipes';
import { materialPriceBasisOf } from './priceBasis';
import { usePlanMaterials } from './usePlanMaterials';
import { useResolvedPlan } from './useResolvedPlan';
import { useMarketSnapshot } from './useMarketSnapshot';
import { priceVsMedianFor, usePriceVsMedian } from './usePriceVsMedian';
import { formatDuration } from '@/lib/duration';
import { useTableExport } from '@/components/ui/useTableExport';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { writeToClipboard } from '@/lib/clipboard';
import { mineralShortfall } from '@/engine/industry/oreBuyPlan';
import { BuyOreDialog } from './buyOre/BuyOreDialog';
import { parseTaxPct } from './planInputParsers';
import { buildItemMenuProps } from './buildItemMenuProps';
import { MaterialsTable, type MaterialsTableHandle } from './MaterialsTable';
import { SourcingInput } from './SourcingInput';
import { BuildRecipeModal } from './BuildRecipeModal';
import { BlueprintAcquisitionModal } from './BlueprintAcquisitionModal';
import { materialsCsvColumns } from './materialsCsv';
import { GroupOwnedDiffersHint } from './GroupOwnedDiffersHint';
import {
  blueprintsLeftOutCount,
  hasShoppingList,
  shoppingListText,
} from '@/engine/industry/shoppingList';
import { buildRecipe } from './subBuildPlan';
import { formatIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  groupOwnedDifference,
  materialTypeIdKey,
  ownedStockView,
  planSourcingPatches,
  typeIdsFromKey,
} from './planMaterialsView';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import type { CorpOwnedStockState } from './corpOwnedStock';
import { pricingSourcesForHub, type BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { blueprintTypeIdsIn, useBlueprintPurchaseOffers } from './blueprintPurchaseOffers';
import { PlanOwnedStockControl } from './PlanOwnedStockControl';
import { PlanRunsControl } from './PlanRunsControl';
import { BuildPlanAutoBuildControl } from './BuildPlanAutoBuildControl';
import { ResultsSummary } from './ResultsSummary';
import { useCheaperNearbySystems } from './useCheaperNearbySystems';
import { formatCostIndex } from './format';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { BpcCoverageWarning, PlanVerdictHero } from './PlanVerdictHero';
import { PlanSetupFacts } from './PlanSetupFacts';
import { useNearestLowsecSystem } from './useNearestLowsecSystem';
import { planReactionLocation } from './planReactionLocation';
import { PlanScheduleLine } from './PlanScheduleLine';
import { planJobNodes, usePlanSchedule } from './planJobSlots';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { ProductionRunsPanel } from './ProductionRunsPanel';
import { BuildSystemInput } from './BuildSystemInput';
import { BuildLocationPicker } from './BuildLocationPicker';
import { buildLocationLabel } from './buildLocationLabel';
import { buildLocationPatch, reactionBuildLocationPatch } from './buildLocationPatch';
import { useDerivedSecurityBand } from './useDerivedSecurityBand';
import { usePlanEdits } from './usePlanEdits';

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
    | 'costIndexOverridePct'
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

const NO_GROUP_MEMBERS: readonly GroupClaimMember[] = [];

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
   * Everything else this plan is priced against (`buildPlanPricingInputs.ts`):
   * the assumed-ME and include-blueprint-cost settings, standings, the corp's
   * blueprints (folded into `ownedBlueprints` exactly when
   * `plan.includeCorpAssets` is on, issue #839) and BPC Sourcing offers.
   * Loaded once by `useIndustryWorkspace`, above this component's
   * `key={plan.id}` remount boundary, so switching plans never reloads it.
   */
  pricingInputs: BuildPlanPricingInputs;
  /**
   * Every write this panel makes to its plan, as one `BuildPlanChange` — a
   * pilot edit, a derived fix, or sourcing edits. The caller hands it to
   * `buildPlanStore.applyBuildPlanChange`, which owns the merge, `updatedAt`
   * and sync rules for each kind.
   */
  onChange: (change: BuildPlanChange) => void;
  /** This plan's group's last Retarget (issue #632), or null when ungrouped or not yet Retargeted. */
  groupSnapshot: BuildGroupSnapshot | null;
  /** This plan's Build Group (name, id, owned-stock ledger) for the owned-total-differs hint, or null when ungrouped. */
  group?: (Pick<BuildGroup, 'id' | 'name'> & { ownedStock?: Record<number, number> }) | null;
  /**
   * Every plan in `group`, this one included (issue #3992): their Haves are
   * claims this plan's "Use assets" offer leaves out. Empty when ungrouped.
   */
  groupMembers?: readonly GroupClaimMember[];
  /**
   * The picker/override modal's "search BPC Sourcing" action (issue #839) —
   * navigates to `bpcSourcingHref(<typeID>)`. A prop rather
   * than an inline `useNavigate` here, since this component stays
   * route-agnostic; `IndustryPlanPage.tsx` supplies it.
   */
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
  /**
   * A completed job's runs/cost, carried from Active Jobs' "Log
   * production…" row action (issue #1787) via `IndustryPlanPage`'s
   * navigation state — this is the one plan the pilot (or the dialog that
   * resolved it) already picked as the job's target. Opens Log Production
   * prefilled with the job's own numbers instead of the plan's live
   * estimate. Absent for every other way this page is reached.
   */
  pendingLogProduction?: JobProductionSeed | null;
  /**
   * Identifies *which* navigation `pendingLogProduction` arrived with
   * (`location.key`) — every `navigate()` call gets a fresh one, even to
   * this same route, which is what lets a job whose matching plan is the
   * one already open still open Log Production on a second click instead of
   * being a no-op (issue #1787 review). Required whenever
   * `pendingLogProduction` is set.
   */
  pendingLogProductionKey?: string;
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
  pricingInputs,
  onChange,
  groupSnapshot,
  group = null,
  groupMembers = NO_GROUP_MEMBERS,
  onSearchBpcSourcing,
  pendingLogProduction,
  pendingLogProductionKey,
}: BuildPlanDetailProps) {
  const { t } = useTranslation();

  const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID) ?? null;
  const blueprint = useMemo(() => (entry ? toIndustryBlueprint(entry.blueprint) : null), [entry]);
  const activity = blueprint ? industryActivityOf(blueprint) : 'manufacturing';
  const {
    latestPlan,
    latestOnChange,
    update,
    movePlan,
    changeSourcing,
    changeOneSourcing,
    toggleBuildHere,
    buildHereAll,
    toggleIncludeReactions,
  } = usePlanEdits(plan, activity, onChange);
  const hub = useMemo(() => getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB, [plan.hubId]);
  const productTypeID = entry?.productTypeID ?? null;
  const vs90dTargets = useMemo(
    () => (productTypeID === null ? [] : [{ hubId: hub.id, typeId: productTypeID }]),
    [hub.id, productTypeID]
  );
  const productVs90d = priceVsMedianFor(usePriceVsMedian(vs90dTargets), hub.id, productTypeID);
  // This plan's share of the pricing inputs, for its own Trade Hub: the
  // assumed ME every unowned sub-build is quoted at, whether Blueprint
  // Acquisition's cost counts toward profit, the corp's blueprints, the
  // standing toward this hub's NPC owner (issue #1238, for the broker
  // fee/break-even price) and BPC Sourcing offers in this hub's region (issue
  // #838; none when BPC Sourcing isn't synced, so the price cascade falls
  // through to the BPO's own hub sell price). `IndustryPlanPage` doesn't
  // mount this component until `pricingInputs.hydrated`, so these are always
  // the pilot's own settings, never the defaults (#2054).
  const {
    assumedMe,
    corpBlueprints,
    standing,
    bpcOffersFor,
    bpcLastResortOffersFor,
    communityOffersFor,
  } = pricingSourcesForHub(pricingInputs, hub);
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
  // Region market and LP Store offers for every blueprint in the tree, so a
  // blueprint the hub station doesn't sell still gets a price.
  const blueprintTypeIds = useMemo(() => blueprintTypeIdsIn(typeIds, catalog), [typeIds, catalog]);
  const {
    offersFor: blueprintPurchaseOffersFor,
    inventionMarket,
    ready: blueprintOffersReady,
  } = useBlueprintPurchaseOffers(plan.characterId, hub, blueprintTypeIds);

  // Started on mount so the remembered locations are usually in hand before
  // `toggleIncludeReactions` reads them; it still awaits them itself. Both
  // stores are also written from here: a location the pilot sets on this page
  // becomes where their next plan starts (`rememberLocationFromEdit.ts`).
  useEffect(() => {
    void hydrateActivityFacilityDefaults();
  }, []);

  const [refreshTick, setRefreshTick] = useState(0);
  /**
   * What the shopping-list button says right now. A clipboard write leaves
   * nothing on screen to look at, so the control has to report itself —
   * `null` is the resting label, and the other two states replace it for a
   * moment. Same beside-the-control confirmation the skill planner's export
   * uses, in the one form a toolbar IconButton has: its own icon and label.
   */
  const { copied: copyState, flash: flashCopy } = useCopyFeedback<'copied' | 'failed'>(2000);
  /** Blueprint Acquisition rows (issue #838) `shoppingListText` just left out of a successful copy. */
  const [blueprintsLeftOut, setBlueprintsLeftOut] = useState(0);
  // Verdict-first layout: the setup folds to one line at the hero's foot, the
  // ledger follows the viewport (open where there is room beside the
  // materials, folded on a phone until asked), and the one Calculation
  // Breakdown is owned here so the hero's break-even ⓘ and the ledger
  // header's ⓘ open the same modal.
  const [setupOpen, setSetupOpen] = useState(false);
  const setupFormId = useId();
  // How the hero counts owned materials, and how they would be sold. Page
  // state, not plan state: a way of reading the plan, like a sort.
  const [profitBasis, setProfitBasis] = useState<ProfitBasis>('sellValue');
  const [saleBasis, setSaleBasis] = useState<LiquidationBasis>('instant');
  // The build-here list a strategy change replaced, for the toast's Undo.
  const [strategyUndo, setStrategyUndo] = useState<{
    previous: number[];
    built: number;
  } | null>(null);
  const isDesktop = useIsDesktop();
  const [costsOpen, setCostsOpen] = useState<boolean | null>(null);
  const costsExpanded = costsOpen ?? isDesktop;
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [logRequest, setLogRequest] = useState(0);
  /**
   * `pendingLogProduction`'s application, keyed off `pendingLogProductionKey`
   * (`location.key`) rather than mount alone: a job whose matching plan is
   * the one already open navigates to this same route, which doesn't remount
   * this component, so a mount-only effect would treat a second "Log
   * production…" click as a no-op (issue #1787 review). Re-applying is keyed
   * to the *navigation*, not the render, so an unrelated re-render can't
   * replay it either. `logRequest`'s bump must still land as a genuine
   * increase *after* `ProductionRunsPanel`'s own mount/last-seen baseline —
   * that panel only opens on `logRequest > (whatever it last saw)` — which
   * reading the current value here (rather than a functional update)
   * guarantees.
   */
  const [jobLogSeed, setJobLogSeed] = useState<{
    request: number;
    quantity: number;
    jobFee: number;
    jobId?: number;
  } | null>(null);
  const appliedLogProductionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingLogProduction || !blueprint) return;
    if (appliedLogProductionKeyRef.current === pendingLogProductionKey) return;
    appliedLogProductionKeyRef.current = pendingLogProductionKey ?? null;
    const quantity = blueprint.products[0]
      ? blueprint.products[0].quantity * pendingLogProduction.runs
      : 0;
    const nextRequest = logRequest + 1;
    setJobLogSeed({
      request: nextRequest,
      quantity,
      jobFee: pendingLogProduction.jobFee,
      jobId: pendingLogProduction.jobId,
    });
    setLogRequest(nextRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `logRequest` deliberately omitted: reapplying is gated on `pendingLogProductionKey` changing, not on `logRequest` itself, which this effect also writes
  }, [pendingLogProduction, pendingLogProductionKey, blueprint]);
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

  // Reactions cannot run in highsec (issue #2908). The warning follows the
  // place reactions are planned: the Reaction Location when Include Reactions
  // is on, or the plan's own Build Location for a reaction-activity plan. An
  // unchosen location is "not set", never highsec — its stored band is only a
  // pricing default.
  const reactionPlace = planReactionLocation(plan, activity);
  const reactionsInHighsec = reactionPlace?.state === 'highsec';
  const nearestLowsec = useNearestLowsecSystem(
    plan.characterId,
    reactionPlace?.system?.id ?? null,
    reactionsInHighsec
  );
  const moveReactionsTo = (system: { id: number; name: string }) =>
    update(
      activity === 'reaction'
        ? {
            buildSystemId: system.id,
            buildSystemName: system.name,
            ...clearedBuildLocation,
            security: 'lowsec',
          }
        : {
            reactionBuildSystemId: system.id,
            reactionBuildSystemName: system.name,
            ...clearedReactionBuildLocation,
            reactionSecurity: 'lowsec',
          }
    );
  const chooseReactionLocation = () => {
    setSetupOpen(true);
    const inputId =
      activity === 'reaction' ? 'build-location-input' : 'build-plan-reaction-location-input';
    // The picker mounts with the opened Setup panel, so focus on the next frame.
    requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  };
  const reactionLocationBlock =
    reactionPlace && reactionsInHighsec && reactionPlace.system
      ? {
          facilityName: reactionPlace.facilityName,
          systemName: reactionPlace.system.name,
          fix: nearestLowsec
            ? { systemName: nearestLowsec.name, onApply: () => moveReactionsTo(nearestLowsec) }
            : null,
          onChoose: chooseReactionLocation,
        }
      : undefined;

  // Distinct from `pricesReady` below: that one collapses "still fetching"
  // and "the live ESI call failed" into the same false, which used to flash
  // the "prices unavailable" warning on every fresh load before the first
  // response landed.
  const {
    snapshot: esiSnapshot,
    fetchedAt,
    loading: pricesLoading,
  } = useMarketSnapshot(hub, typeIds, buildSystem?.id, activity, refreshTick);
  // The pilot's own cost index outranks ESI's — the only one there is in
  // J-Space. Everything below reads this; `esiSnapshot` is for asking what ESI
  // itself could not supply.
  const snapshot = useMemo(
    () => applyCostIndexOverride(esiSnapshot, plan.costIndexOverridePct),
    [esiSnapshot, plan.costIndexOverridePct]
  );
  const costIndexMissing = esiSnapshot?.systemCostIndexMissing === true;

  // A plan that opens at a facility the pilot already described (a new plan
  // starts at the remembered location) gets that description back without a
  // pick: its rigs and tax while it still has none of its own, and the cost
  // index where ESI has none. Once per facility, and not keyed on the override
  // itself — a pilot clearing it must not have it recalled straight back.
  const memoryKey = facilityMemoryKey(plan);
  const recalledFor = useRef<{ rigs: string | null; index: string | null }>({
    rigs: null,
    index: null,
  });
  useEffect(() => {
    if (memoryKey === null) return;
    const wantRigs = recalledFor.current.rigs !== memoryKey;
    const wantIndex = costIndexMissing && recalledFor.current.index !== memoryKey;
    if (!wantRigs && !wantIndex) return;
    if (wantRigs) recalledFor.current.rigs = memoryKey;
    if (wantIndex) recalledFor.current.index = memoryKey;
    void recallFacility(latestPlan.current).then((memory) => {
      const current = latestPlan.current;
      if (!memory || facilityMemoryKey(current) !== memoryKey) return;
      const patch = patchFromMemory(memory, current.facility);
      const bare = resolveRigFit(current).every((kind) => kind === 'none');
      if (!wantRigs || !bare) {
        delete patch.rigFit;
        delete patch.facilityTaxPct;
      }
      if (!wantIndex || current.costIndexOverridePct !== undefined) {
        delete patch.costIndexOverridePct;
      }
      if (Object.keys(patch).length > 0) latestOnChange.current({ kind: 'edit', patch });
    });
  }, [costIndexMissing, memoryKey, latestPlan, latestOnChange]);

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
        corpBlueprints
      ),
    [ownedBlueprints, plan.includeCorpAssets, corpBlueprints]
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
  const { resolved, depth, resolveAt } = useResolvedPlan({
    plan,
    hub,
    sources: {
      catalog,
      pi,
      ownedBlueprints,
      corpBlueprints,
      assumedMe,
      modifiers,
      standing,
      bpcOffersFor,
      bpcLastResortOffersFor,
      blueprintPurchaseOffersFor,
      inventionMarket,
      communityOffersFor,
    },
    snapshot,
    reactionSystemCostIndex: reactionSnapshot?.systemCostIndex,
    fetchedAtMs: fetchedAt?.getTime(),
  });
  const { result, error, makeOrBuyContext, resolvedMe, resolvedTe, materialPrices, bpcCoverage } =
    resolved;

  /**
   * Runs at which this plan's profit first reaches zero — buying a BPO is the
   * case it exists for. On the hero's profit basis: on sell value, each trial's
   * profit is net of what the owned stock that many runs would use could fetch,
   * since a bigger job eats more of it.
   */
  const findBreakEvenRuns = () => {
    const runs = breakEvenRuns((trial) => {
      const trialResult = resolveAt({ ...plan, runs: trial }).result;
      if (!trialResult || trialResult.profit === null) return null;
      if (heroBasis !== 'sellValue' || !snapshot) return trialResult.profit;
      const sale = planOwnedStockSale(
        trialResult.materials,
        snapshot,
        saleBasis,
        modifiers.skills,
        standing
      );
      // The hero's own rule: an owned type with no price leaves no sell value
      // to charge, and a trial's run count can reach stock this one didn't.
      if (sale.unpriced.length > 0) return trialResult.profit;
      return trialResult.profit - sale.net;
    }, plan.runs);
    if (runs !== null) update({ runs });
    return runs;
  };

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
      instant: planOwnedStockSale(
        result.materials,
        snapshot,
        'instant',
        modifiers.skills,
        standing
      ),
      order: planOwnedStockSale(result.materials, snapshot, 'order', modifiers.skills, standing),
    };
  }, [result, snapshot, modifiers, standing]);

  // Blueprint prices are provisional until the market/LP offers land, so the
  // page doesn't offer to "find" a blueprint the next render prices.
  // An unreachable price source reads as "not ready", never as free materials.
  // Either source being down leaves the result unpriceable: the hub lookup, or
  // the ESI adjusted prices the job cost is computed from.
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const pricesUnreachable =
    snapshot !== null &&
    (snapshot.hubPricesUnreachable === true || snapshot.adjustedPrices === null);
  const pricesReady =
    snapshot !== null &&
    snapshot.adjustedPrices !== null &&
    snapshot.systemCostIndex !== null &&
    !pricesUnreachable &&
    blueprintOffersReady;

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

  const {
    visibleMaterials,
    materialVolume,
    shoppingMaterials,
    boughtDepth,
    anySubBuilds,
    subBuildTimeSeconds,
    materialAdvice,
    builtTopLevel,
    subBuildTotal,
    buyInsteadTotal,
  } = usePlanMaterials({
    result,
    catalog,
    depth,
    materialSourcing: plan.materialSourcing,
    materialPrices,
    makeOrBuyContext,
    recipeFor,
  });

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
  const skillGates = useMemo(() => {
    const gates = new Map<number, SkillGateVerdict>();
    for (const material of visibleMaterials) {
      const requirements = catalog.byProductTypeID.get(material.typeID)?.blueprint.skills ?? [];
      gates.set(material.typeID, evaluateSkillGate(requirements, accountSkills));
    }
    return gates;
  }, [visibleMaterials, catalog, accountSkills]);

  // The plan's own top-level product (issue #1231) — the header this same
  // account-wide check used to explicitly skip (see the 2026-09-14 decision
  // this reverses for the top-level case).
  // The header counts only the materials set to build, never one the pilot
  // buys. The product's own blueprint is not in it: a plan that buys every
  // material shows nothing here.
  const topLevelSkillGate = useMemo(
    () =>
      mergeSkillGates(
        visibleMaterials
          .filter((material) => material.subBuilds.length > 0)
          .map((material) => skillGates.get(material.typeID))
      ),
    [visibleMaterials, skillGates]
  );

  // `detection.scopedQuantityFor` is narrowed to the plan's owned-stock scope
  // (issue #454); `detectedStock` stays the galaxy-wide picture.
  const { detection } = useMemo(
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

  // Sibling members' Haves, against the same stock this plan's offer reads.
  const groupClaimsFor = useMemo(
    () =>
      group !== null && groupMembers.length > 1
        ? groupStockClaims(plan, groupMembers, detectedStock)
        : undefined,
    [group, plan, groupMembers, detectedStock]
  );

  // "Use all" / "Use none" run inside the Materials table over every row on
  // it (the rows the per-row offers reach, sub-build inputs included) and
  // share a row edit's toast and Undo (`materialsEditSession.ts`).
  const materialsTable = useRef<MaterialsTableHandle>(null);

  /**
   * The recipe behind whichever built row's "Build it" is open — the runs and
   * ingredient list the flat table no longer nests (`subBuildPlan`). Held as
   * a typeID rather than the recipe itself so a re-priced or re-toggled plan
   * refreshes what the modal shows instead of freezing the numbers it opened
   * with; a typeID that is no longer built simply resolves to `null`, which
   * is also how the modal closes when its row stops being built underneath it.
   */
  const [recipeTypeId, setRecipeTypeId] = useState<number | null>(null);

  /** "Buy ore instead", offered only while the plan still buys a mineral. */
  const [buyOreOpen, setBuyOreOpen] = useState(false);
  const shortfall = useMemo(() => mineralShortfall(visibleMaterials), [visibleMaterials]);
  const hasShortfall = Object.keys(shortfall.needs).length > 0;

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
  // The Invent section's numbers, priced exactly as automatic selection
  // priced the blueprint (issue #3990).
  const acquisitionPickerInvention = useMemo(() => {
    if (acquisitionPickerTypeId === null) return null;
    const ctx = inventionPricingContextFor(
      plan,
      { catalog, inventionMarket, ownedBlueprints, corpBlueprints, modifiers },
      snapshot
    );
    const result = ctx ? inventionQuoteFor(acquisitionPickerTypeId, ctx) : null;
    return result
      ? { result, t1BlueprintName: nameForType(catalog, result.recipe.t1BlueprintTypeID) }
      : null;
  }, [
    acquisitionPickerTypeId,
    plan,
    catalog,
    inventionMarket,
    ownedBlueprints,
    corpBlueprints,
    modifiers,
    snapshot,
  ]);

  const openRecipe = useMemo(() => {
    const row = visibleMaterials.find((material) => material.typeID === recipeTypeId);
    return row ? buildRecipe(row) : null;
  }, [visibleMaterials, recipeTypeId]);

  const jobNodes = useMemo(
    () =>
      result
        ? planJobNodes(
            {
              activity,
              seconds: result.seconds,
              materials: result.materials,
              blueprintTypeID: plan.blueprintTypeID,
            },
            catalog
          )
        : [],
    [result, activity, catalog, plan.blueprintTypeID]
  );
  const planCorpBlueprints = useMemo(
    () => planOwnedBlueprints({ includeCorpAssets: plan.includeCorpAssets }, [], corpBlueprints),
    [plan.includeCorpAssets, corpBlueprints]
  );
  const planSchedule = usePlanSchedule(plan.characterId, jobNodes, planCorpBlueprints);
  const planSeconds = planSchedule
    ? (planSchedule.schedule.finishMs - planSchedule.nowMs) / 1000
    : undefined;

  // The Materials table's rows as shown, for its export button and row menus.
  const materialsCsv = useMemo(
    () =>
      materialsCsvColumns(
        t,
        (typeID) => nameForType(catalog, typeID),
        plan.materialSourcing,
        pricesReady,
        materialAdvice
      ),
    [t, catalog, plan.materialSourcing, pricesReady, materialAdvice]
  );
  const materialsExport = useTableExport({
    surface: 'build-materials',
    rows: visibleMaterials,
    columns: materialsCsv,
    // Materials renders one table per section (To buy, Building, …), so no
    // single mounted table holds every row — export the plan's own list.
    source: 'rows',
  });

  const cheaperSystems = useCheaperNearbySystems(
    buildSystem?.id,
    activity,
    snapshot?.systemCostIndex ?? null
  );

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  // Units produced by the job (per-run product quantity x runs); null when
  // the blueprint has no product. Shared by the Results panel and the
  // Production Runs panel's "Log Production" default below.
  const productQuantity = blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null;

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
    });
    const previous = plan.buildHere ?? [];
    update({ buildHere: [...picked] });
    setStrategyUndo({ previous: [...previous], built: picked.size });
  }

  const { itemMenuFor, itemActionsFor } = buildItemMenuProps(catalog);

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
      flashCopy('copied');
      // Multibuy can't buy a blueprint (issue #1778) — shoppingListText already
      // dropped it; name the count so the pilot knows to buy it by contract.
      setBlueprintsLeftOut(blueprintsLeftOutCount(shoppingMaterials));
    } catch {
      flashCopy('failed');
    }
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
    planSeconds,
    depthRows: [...boughtDepth].map(([typeID, walk]) => ({
      typeID,
      name: nameForType(catalog, typeID),
      walk,
    })),
  };

  const lacksBlueprintRow =
    result !== null &&
    !result.materials.some((m) => m.typeID === plan.blueprintTypeID && m.acquisitionTier);

  const ownedForSale = ownedSale && ownedSale.instant.ownedUnits > 0 ? ownedSale[saleBasis] : null;
  // Nothing owned, or an owned material with no price: no sell value to
  // charge, so there is no basis to switch and the plan's own figure stands.
  const heroBasis: ProfitBasis | null =
    ownedForSale && ownedForSale.unpriced.length === 0 ? profitBasis : null;
  const heroFigures = result
    ? profitOnBasis(heroBasis ?? 'free', {
        result,
        ownedSellNet: ownedForSale?.net ?? null,
        productQuantity: productQuantity ?? 0,
        productUnitPrice,
        accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
        brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
        factionStanding: standing?.factionStanding,
        corpStanding: standing?.corpStanding,
      })
    : null;
  // The product sold into buy orders instead, on the hero's basis so it reads
  // against the Profit row above it (issue #5007).
  const sellNow =
    result && snapshot && entry.productTypeID !== null && productQuantity !== null
      ? productSellNow({
          productTypeID: entry.productTypeID,
          productQuantity,
          hubBuyPrices: snapshot.hubBuyPrices,
          skills: modifiers.skills,
          totalCost: result.totalCost,
          forgone: heroBasis === 'sellValue' && ownedForSale ? ownedForSale.net : 0,
        })
      : undefined;
  const cheapest = cheaperSystems[0];
  const currentIndex = snapshot?.systemCostIndex ?? null;
  const cheaperNearbySaving =
    cheapest && result && currentIndex !== null && currentIndex > 0
      ? moveSaving(result.jobFee, currentIndex, cheapest.index, cheapest.npcStation)
      : 0;
  const cheaperNearbyLine =
    cheapest && cheaperNearbySaving > 0 ? (
      <>
        {t('industry.ledger.cheaperNearby', {
          system: cheapest.name,
          count: cheapest.jumps,
          index: formatCostIndex(cheapest.index),
          amount: formatIsk(cheaperNearbySaving),
        })}{' '}
        {/* The same move the build-system field makes: the band follows the
            system, and a picked structure is cleared since it was elsewhere. */}
        <button
          type="button"
          className={textActionClassName('inline-flex')}
          onClick={() =>
            movePlan({
              buildSystemId: cheapest.id,
              buildSystemName: cheapest.name,
              ...clearedBuildLocation,
              security: securityBand(cheapest.security),
              // The station found there is what the plan builds in: no rigs,
              // and the tax drops back to the NPC rate `jobFee` applies.
              ...(cheapest.npcStation
                ? {
                    facility: 'npcStation' as const,
                    rigFit: EMPTY_RIG_FIT,
                    facilityTaxPct: undefined,
                  }
                : {}),
            })
          }
        >
          {t('industry.ledger.buildThere')}
        </button>
      </>
    ) : null;

  const setupStrip = (
    <>
      {/* While the form is open it is the summary; the strip keeps only its toggle. */}
      {!setupOpen && (
        <PlanSetupFacts
          plan={plan}
          activity={activity}
          hub={hub}
          facilityPreset={facilityPreset}
          buildSystemName={buildSystem?.name ?? null}
          buildLocationName={buildLocationName}
          includeReactions={includeReactions}
          reactionBuildSystemName={reactionBuildSystem?.name ?? null}
          reactionBuildLocationName={reactionBuildLocationName}
          reactionsInHighsec={reactionsInHighsec}
          resolvedMe={resolvedMe}
          resolvedTe={resolvedTe}
          lacksBlueprintRow={lacksBlueprintRow}
        />
      )}
      <button
        type="button"
        className={textActionClassName('ml-auto shrink-0')}
        aria-expanded={setupOpen}
        aria-controls={setupFormId}
        onClick={() => setSetupOpen((open) => !open)}
      >
        {setupOpen ? t('industry.setupDone') : t('industry.setupEdit')}
      </button>
    </>
  );

  const runsControl = (
    <PlanRunsControl
      runs={plan.runs}
      onRunsChange={(runs) => update({ runs })}
      seconds={result ? (planSeconds ?? result.seconds) : null}
      profit={heroFigures?.profit ?? null}
      findBreakEven={
        pricesReady && heroFigures?.profit != null && heroFigures.profit < 0
          ? findBreakEvenRuns
          : null
      }
    />
  );

  // Slides open under the setup strip, attached to the card it edits, rather
  // than a second card that pushes the page down.
  const renderSetupForm = (className: string) => (
    <Collapse open={setupOpen} id={setupFormId} className={className}>
      <div className="space-y-4">
        {bpcCoverage && (
          <div>
            <h3 className={cx(eyebrowClassName, 'border-b border-line pb-1')}>
              {t('industry.groupBlueprint')}
            </h3>
            <div className="mt-2">
              <BpcCoverageWarning
                coverage={bpcCoverage}
                blueprintName={nameForType(catalog, plan.blueprintTypeID)}
                onSetRuns={(runs) => update({ runs })}
              />
            </div>
          </div>
        )}

        <div>
          <h3
            className={cx(
              eyebrowClassName,
              'flex items-center justify-between gap-2 border-b border-line pb-1'
            )}
          >
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
              onPick={(option) => movePlan(buildLocationPatch(option))}
            >
              <label className="flex flex-col gap-1 text-xs">
                {t('industry.facility')}
                <Select
                  value={plan.facility}
                  onValueChange={(value) => {
                    const facility = value as FacilityKind;
                    const structure = FACILITY_PRESETS[facility].structure;
                    movePlan({
                      facility,
                      ...clearedBuildLocation,
                      ...(structure ? {} : { rigFit: EMPTY_RIG_FIT, facilityTaxPct: undefined }),
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
                  movePlan({
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
                  <div className="flex flex-wrap items-center gap-2">
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
                    <RigMatchHelper
                      facility={plan.facility}
                      security={plan.security}
                      onApply={(fit) => update({ rigFit: fit })}
                    />
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
                  {/* Commits on blur/Enter, like Runs: a per-keystroke write
                        round-trips IndexedDB and re-resolves the whole plan, so
                        a controlled field lagged and could drop characters. */}
                  <SourcingInput
                    id="build-plan-facility-tax"
                    value={plan.facilityTaxPct ?? 0}
                    label={t('industry.facilityTax')}
                    inputMode="decimal"
                    widthClassName="w-full"
                    parse={(raw) => parseTaxPct(plan.facilityTaxPct ?? 0, raw)}
                    onCommit={(facilityTaxPct) => update({ facilityTaxPct })}
                  />
                </div>
              )}

              {/* Only where ESI has no index for the Build location (J-Space) or
                    the pilot has already typed one: elsewhere ESI's figure is right
                    and a field would only invite overriding it. */}
              {(costIndexMissing || plan.costIndexOverridePct !== undefined) && (
                <div className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-1">
                    <label htmlFor="build-plan-cost-index">{t('industry.costIndexOverride')}</label>
                    <InfoTooltip
                      label={t('industry.costIndexOverrideTooltipLabel')}
                      content={t('industry.costIndexOverrideTooltip')}
                    />
                  </span>
                  <SourcingInput
                    id="build-plan-cost-index"
                    value={plan.costIndexOverridePct}
                    label={t('industry.costIndexOverride')}
                    inputMode="decimal"
                    widthClassName="w-full"
                    placeholder="0"
                    mine={costIndexSource(snapshot, plan.costIndexOverridePct) === 'override'}
                    describedBy={
                      costIndexMissing && plan.costIndexOverridePct === undefined
                        ? 'build-plan-cost-index-note'
                        : undefined
                    }
                    parse={(raw) => {
                      const parsed = parseCostIndexPct(raw);
                      // Blank clears, unreadable keeps what was there.
                      return parsed === undefined
                        ? plan.costIndexOverridePct
                        : (parsed ?? undefined);
                    }}
                    onCommit={(costIndexOverridePct) => update({ costIndexOverridePct })}
                  />
                  {costIndexMissing && plan.costIndexOverridePct === undefined && (
                    <p id="build-plan-cost-index-note" className="text-warning">
                      {t('industry.costIndexMissingNote')}
                    </p>
                  )}
                </div>
              )}

              <label className="flex flex-col gap-1 text-xs">
                {t('industry.tradeHub')}
                <Select
                  value={plan.hubId}
                  onValueChange={(value) => update({ hubId: value as BuildPlanRecord['hubId'] })}
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
                    outright costs (GLOSSARY.md, Acquisition Verdict). */}
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
                  <label className={touchCheckboxLabelClassName}>
                    <Checkbox
                      id="build-plan-include-reactions"
                      checked={includeReactions}
                      onChange={(e) => toggleIncludeReactions(e.target.checked)}
                    />
                  </label>
                  <label
                    htmlFor="build-plan-include-reactions"
                    className={`inline-flex items-center ${tappableRowClassName}`}
                  >
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
                        system: reactionBuildSystem?.name ?? t('industry.reactionLocationNotSet'),
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
                    {reactionsInHighsec && (
                      <p className="text-xs text-warning">
                        {t('industry.reactionBlocked.setupRule')}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-3">
                        <span>{t('industry.rigFitLabel')}</span>
                        <div className="flex flex-wrap items-center gap-2">
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
                          <RigMatchHelper
                            facility={plan.reactionFacility ?? 'athanor'}
                            security={plan.reactionSecurity ?? 'highsec'}
                            onApply={(fit) => update({ reactionRigFit: fit })}
                          />
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
                        <SourcingInput
                          id="build-plan-reaction-facility-tax"
                          value={plan.reactionFacilityTaxPct ?? 0}
                          label={t('industry.facilityTax')}
                          inputMode="decimal"
                          widthClassName="w-full"
                          parse={(raw) => parseTaxPct(plan.reactionFacilityTaxPct ?? 0, raw)}
                          onCommit={(reactionFacilityTaxPct) => update({ reactionFacilityTaxPct })}
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
    </Collapse>
  );

  return (
    <div className="space-y-4">
      {result && !error && heroFigures ? (
        <PlanVerdictHero
          result={result}
          figures={heroFigures}
          basis={heroBasis}
          onBasisChange={setProfitBasis}
          runsControl={runsControl}
          footer={setupStrip}
          expansion={renderSetupForm('border-t border-line p-4')}
          pricesReady={pricesReady}
          pricesUnreachable={pricesUnreachable}
          pricesLoading={pricesLoading}
          productName={entry.productName}
          productTypeID={entry.productTypeID}
          itemMenuFor={itemMenuFor}
          itemActionsFor={itemActionsFor}
          bpcCoverage={bpcCoverage}
          blueprintName={nameForType(catalog, plan.blueprintTypeID)}
          onSetRuns={(runs) => update({ runs })}
          breakdown={{
            ...breakdownContext,
            sellValue:
              heroBasis === 'sellValue' && ownedForSale
                ? { forgone: ownedForSale.net, breakEvenPrice: heroFigures.breakEvenPrice }
                : null,
            sellNow,
          }}
          breakdownOpen={breakdownOpen}
          onBreakdownOpenChange={setBreakdownOpen}
          onLogProduction={() => setLogRequest((n) => n + 1)}
          logProductionDisabled={entry.productTypeID === null}
          locationBlock={reactionLocationBlock}
          skillGate={topLevelSkillGate}
          nameForSkill={(typeID) => nameForType(catalog, typeID)}
          nameForCharacter={(characterId) => characterNames.get(characterId) ?? t('common.unknown')}
          slotLine={planSchedule && <PlanScheduleLine plan={planSchedule} />}
          vs90dPct={productVs90d ?? null}
        />
      ) : (
        <Panel title={t('industry.setup')}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {runsControl}
            {setupStrip}
          </div>
          {/* Inside the panel's own padding: a rule and a gap, no second inset. */}
          {renderSetupForm('mt-3 border-t border-line pt-3')}
        </Panel>
      )}
      {result && !error && result.revenue !== null && (
        <AssumesBaseStandingsNote
          characterId={plan.characterId}
          hint={t('industry.assumesBaseStandingsHint')}
        />
      )}

      {/*
        Side by side from `xl`, not `lg` (issue #2165): at 1024 the fixed 20rem
        Costs & revenue column starved Materials by ~189px, pushing Price and
        Line total — the override input included — out of the table's frame.
        Between `lg` and `xl` the two stack instead.
      */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <Panel
          title={t('industry.materials')}
          actions={
            // `flex-wrap`: four items — data age, the shopping-list copy (its
            // label hidden below `md`), export and refresh — beside the panel
            // title; if they ever run out of room, wrapping inside the
            // (min-height, not fixed) header beats clipping.
            <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-text-dim">
              {fetchedAt && <DataAgeBadge date={fetchedAt} />}
              {/*
              Gated on there being a remainder to order, not on the table
              having rows: a plan whose every material is already owned still
              renders a full table, and the list it would copy is empty.
            */}
              <LiveStatus>
                {copyState === 'copied'
                  ? t('industry.copyShoppingListDone')
                  : copyState === 'failed'
                    ? t('industry.copyShoppingListFailed')
                    : null}
              </LiveStatus>
              <Button
                size="sm"
                onClick={() => void copyShoppingList()}
                disabled={!!error || !result || !hasShoppingList(shoppingMaterials)}
              >
                {/* Both outcomes change the glyph as well as the words, so neither
                    is carried by colour alone (docs/DESIGN.md §7). */}
                {copyState === 'copied' ? (
                  <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                ) : copyState === 'failed' ? (
                  <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-danger" />
                ) : (
                  <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                )}
                {/* A short visible label from `md` up, icon-only below it so the
                    header keeps its title on a phone; the full words stay the
                    button's accessible name either way. */}
                <span aria-hidden="true" className="max-md:hidden">
                  {copyState === 'copied'
                    ? t('industry.copyShoppingListDone')
                    : copyState === 'failed'
                      ? t('industry.copyShoppingListFailed')
                      : t('industry.copyShoppingListShort')}
                </span>
                <span className="sr-only">
                  {copyState === 'copied'
                    ? t('industry.copyShoppingListDone')
                    : copyState === 'failed'
                      ? t('industry.copyShoppingListFailed')
                      : t('industry.copyShoppingList')}
                </span>
              </Button>
              {!error && result && visibleMaterials.length > 0 && (
                <TableActionsMenu name={t('industry.materials')} tableExport={materialsExport} />
              )}
              <IconButton
                size="sm"
                icon={<Icon.Refresh />}
                label={t('industry.refresh')}
                onClick={() => setRefreshTick((v) => v + 1)}
              />
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
                {/*
                  One row, two labelled groups: the strategy applies the moment
                  it is picked (Undo in the toast), and everything about which
                  owned stock the table counts sits behind one Owned button —
                  read once per plan, not on every visit.
                */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <BuildPlanAutoBuildControl
                    maxDepth={autoBuildMaxDepth}
                    scope={craftScopeList}
                    disabled={!makeOrBuyContext}
                    onApply={applyAutoBuild}
                  />
                  <PlanOwnedStockControl
                    scope={plan.ownedStockScope}
                    includeCorpAssets={plan.includeCorpAssets ?? false}
                    corpAvailable={corpOwnedStock.available}
                    detectedStock={detectedStock}
                    detection={detection}
                    onScopeChange={(ownedStockScope) => update({ ownedStockScope })}
                    onIncludeCorpAssetsChange={(include) => update({ includeCorpAssets: include })}
                    onFillAll={() => materialsTable.current?.fillAll()}
                    onClearAll={() => materialsTable.current?.clearAll()}
                  />
                </div>
                <GroupOwnedDiffersHint
                  difference={
                    group
                      ? groupOwnedDifference(
                          visibleMaterials.map(({ typeID }) => ({
                            typeID,
                            name: nameForType(catalog, typeID),
                          })),
                          plan.materialSourcing,
                          group.ownedStock
                        )
                      : null
                  }
                  group={group}
                />
              </div>
              <MaterialsTable
                exportProps={materialsExport.tableProps}
                materials={visibleMaterials}
                nameFor={(typeID) => nameForType(catalog, typeID)}
                volumeFor={(typeID) => volumeForType(catalog, typeID)}
                sourcing={plan.materialSourcing}
                pricesReady={pricesReady}
                onSourcingChange={changeOneSourcing}
                onOwnedStockChange={(changes) => changeSourcing(planSourcingPatches(changes))}
                ref={materialsTable}
                detection={detection}
                groupClaimsFor={groupClaimsFor}
                makeOrBuy={materialAdvice}
                canBuildHere={canBuildHere}
                onToggleBuildHere={toggleBuildHere}
                onBuildAll={buildHereAll}
                onBuyOre={hasShortfall ? () => setBuyOreOpen(true) : undefined}
                ownedSellNet={ownedForSale?.net ?? null}
                sellValueFor={(typeID) =>
                  ownedForSale?.lines.find((line) => line.typeID === typeID)?.net
                }
                onShowRecipe={setRecipeTypeId}
                onOpenAcquisitionPicker={setAcquisitionPickerTypeId}
                skillGates={skillGates}
                characterNameFor={detection.characterNameFor}
                depthFor={(typeID) => boughtDepth.get(typeID)}
              />
              {buyOreOpen && (
                <BuyOreDialog
                  open
                  onClose={() => setBuyOreOpen(false)}
                  hub={hub}
                  needs={shortfall.needs}
                  mineralsTotal={shortfall.total}
                />
              )}
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
                  onPickRuns={
                    acquisitionPickerTypeId === plan.blueprintTypeID
                      ? (runs) => update({ runs })
                      : undefined
                  }
                  onSearchBpcSourcing={onSearchBpcSourcing}
                  planHubId={plan.hubId}
                  invention={acquisitionPickerInvention}
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
              pricesReady ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-text-dim">{t('industry.totalCost')}</dt>
                  <dd className="text-right tabular-nums">{formatIsk(result.totalCost)}</dd>
                  {result.revenue !== null && (
                    <>
                      <dt className="text-text-dim">{t('industry.revenue')}</dt>
                      <dd className="text-right tabular-nums">{formatIsk(result.revenue)}</dd>
                    </>
                  )}
                  {heroFigures?.profit != null && (
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
                        {t('industry.profit')}
                      </dt>
                      <dd
                        className={cx(
                          'border-t border-line pt-1 text-right tabular-nums',
                          heroFigures.profit < 0 ? 'text-isk-neg' : 'text-isk-pos'
                        )}
                      >
                        {formatIsk(heroFigures.profit)}
                      </dd>
                    </>
                  )}
                </dl>
              ) : pricesUnreachable ? (
                <p className="text-xs text-text-dim">{pricesUnavailableLabel}</p>
              ) : null
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
              pricesUnreachable={pricesUnreachable}
              pricesLoading={pricesLoading}
              systemCostIndex={snapshot?.systemCostIndex ?? null}
              productName={entry.productName}
              productTypeID={entry.productTypeID}
              productUnitPrice={productUnitPrice}
              productQuantity={productQuantity}
              costIndexSystemName={buildSystem?.name ?? hub.systemName}
              costIndexSystemId={buildSystem?.id}
              activity={activity}
              ownedSale={ownedSale}
              saleBasis={saleBasis}
              onSaleBasisChange={setSaleBasis}
              profitBasis={heroBasis}
              profit={heroFigures?.profit ?? null}
              sellNow={sellNow}
              cheaperNearby={cheaperNearbyLine}
              hubName={hub.systemName}
              planSeconds={planSeconds}
              totalVolume={materialVolume}
            />
          </CollapsiblePanel>
        )}
      </div>

      <ProductionRunsPanel
        blueprintTypeId={plan.blueprintTypeID}
        characterId={plan.characterId}
        buildPlanId={plan.id}
        defaults={
          jobLogSeed && jobLogSeed.request === logRequest
            ? {
                quantity: jobLogSeed.quantity,
                // The job seed only speaks to quantity and job fee — material
                // cost is a plan-level estimate, not something a job carries,
                // so it still comes from the plan's own live result where
                // that's ready (falling back to 0 only until pricing is).
                materialCost: result?.materialCost ?? 0,
                jobFee: jobLogSeed.jobFee,
                sourceJobId: jobLogSeed.jobId,
              }
            : result
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
      {strategyUndo && (
        <Toast
          message={t('industry.strategyApplied', { count: strategyUndo.built })}
          undo={{
            label: t('industry.errands.undo'),
            onUndo: () => {
              update({ buildHere: strategyUndo.previous });
              setStrategyUndo(null);
            },
          }}
          onClose={() => setStrategyUndo(null)}
        />
      )}
      {copyState === 'copied' && blueprintsLeftOut > 0 && (
        <Toast
          message={t('industry.copyShoppingListBlueprintsLeftOut', { count: blueprintsLeftOut })}
        />
      )}
    </div>
  );
}
