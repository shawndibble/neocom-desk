import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, Toast } from '@/components/ui';
import { FACILITY_PRESETS, industryActivityOf } from '@/engine/industry/types';
import type { GroupClaimMember } from '@/engine/industry/groupStockClaims';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import { moveSaving } from '@/engine/industry/moveSaving';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { nameForType, toIndustryBlueprint } from './blueprintCatalog';
import { buildItemMenuProps } from './buildItemMenuProps';
import type { BuildPlanDetailProps } from './BuildPlanDetailProps';
import { CheaperNearbyLine } from './CheaperNearbyLine';
import { InputCostMoveLine } from './InputCostMoveLine';
import { PlanCostsPanel } from './PlanCostsPanel';
import { PlanMaterialsPanel } from './PlanMaterialsPanel';
import { PlanScheduleLine } from './PlanScheduleLine';
import { PlanSetupStrip } from './PlanSetupStrip';
import { PlanSetupForm } from './PlanSetupForm';
import { PlanRunsControl } from './PlanRunsControl';
import { PlanVerdictHero } from './PlanVerdictHero';
import { ProductionRunsPanel } from './ProductionRunsPanel';
import type { MaterialsTableHandle } from './MaterialsTable';
import { productionLogDefaults } from './productionLogDefaults';
import { planBreakEvenRuns } from './planBreakEven';
import { planBreakdownContext } from './planBreakdownContext';
import { planHeroFigures } from './planHeroFigures';
import { planLocations } from './planLocations';
import { priceVsMedianFor, usePriceVsMedian } from './usePriceVsMedian';
import { useAutoBuildPlan } from './useAutoBuildPlan';
import { useCheaperNearbySystems } from './useCheaperNearbySystems';
import { useDerivedSecurityBand } from './useDerivedSecurityBand';
import { useFacilityMemoryRecall } from './useFacilityMemoryRecall';
import { useLogProductionSeed } from './useLogProductionSeed';
import { useMaterialModals } from './useMaterialModals';
import { usePlanEdits } from './usePlanEdits';
import { usePlanFacilityContexts } from './usePlanFacilityContexts';
import { usePlanJobSchedule } from './usePlanJobSchedule';
import { usePlanMaterialsExport } from './usePlanMaterialsExport';
import { usePlanOwnedStock } from './usePlanOwnedStock';
import { usePlanPricing } from './usePlanPricing';
import { useReactionLocationBlock } from './useReactionLocationBlock';
import { usePlanResolution } from './usePlanResolution';
import { useShoppingListCopy } from './useShoppingListCopy';

export type { PlanPatch } from './planPatch';

const NO_GROUP_MEMBERS: readonly GroupClaimMember[] = [];

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
  const pricing = usePlanPricing(plan, blueprint, catalog, pi, pricingInputs);
  const { hub, corpBlueprints, standing } = pricing;
  const productTypeID = entry?.productTypeID ?? null;
  const vs90dTargets = useMemo(
    () => (productTypeID === null ? [] : [{ hubId: hub.id, typeId: productTypeID }]),
    [hub.id, productTypeID]
  );
  const productVs90d = priceVsMedianFor(usePriceVsMedian(vs90dTargets), hub.id, productTypeID);
  const facilityPreset = FACILITY_PRESETS[plan.facility];
  // Include Reactions (issue #698): meaningless for a reaction-activity plan,
  // which is always eligible via its own top-level facility regardless of
  // this flag — see `reactionCraftEligible`.
  const includeReactions = plan.includeReactions ?? false;
  const { craftScopeList, reactionPlanFacilityContext, facilityContext } = usePlanFacilityContexts(
    plan,
    activity,
    includeReactions
  );

  const [refreshTick, setRefreshTick] = useState(0);
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
  const isDesktop = useIsDesktop();
  const [costsOpen, setCostsOpen] = useState<boolean | null>(null);
  const costsExpanded = costsOpen ?? isDesktop;
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const { logRequest, setLogRequest, jobLogSeed } = useLogProductionSeed(
    blueprint,
    pendingLogProduction,
    pendingLogProductionKey
  );
  const { buildSystem, buildLocationName, reactionBuildSystem, reactionBuildLocationName } =
    planLocations(plan, hub.systemName, t);

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

  const { reactionsInHighsec, reactionLocationBlock } = useReactionLocationBlock(
    plan,
    activity,
    update,
    () => setSetupOpen(true)
  );

  const {
    snapshot,
    costIndexMissing,
    fetchedAt,
    pricesLoading,
    effectiveOwnedBlueprints,
    recipeFor,
    canBuildHere,
    resolved,
    resolveAt,
    costMove,
    ownedSale,
    pricesUnreachable,
    pricesReady,
    materials,
  } = usePlanResolution({
    plan,
    catalog,
    pi,
    activity,
    ownedBlueprints,
    modifiers,
    pricing,
    productTypeID,
    craftScopeList,
    buildSystemId: buildSystem?.id,
    reactionBuildSystemId: reactionBuildSystem?.id,
    refreshTick,
  });
  useFacilityMemoryRecall(plan, costIndexMissing, latestPlan, latestOnChange);
  const { result, error, makeOrBuyContext, resolvedMe, resolvedTe, bpcCoverage } = resolved;
  const { visibleMaterials, materialVolume, shoppingMaterials, boughtDepth, materialAdvice } =
    materials;

  const ownedStock = usePlanOwnedStock(
    plan,
    catalog,
    visibleMaterials,
    ownedStockSnapshot,
    corpOwnedStock,
    group,
    groupMembers
  );

  const { autoBuildMaxDepth, applyAutoBuild, strategyUndo, setStrategyUndo } = useAutoBuildPlan({
    plan,
    blueprint,
    resolvedMe,
    modifiers,
    recipeFor,
    facilityContext,
    reactionPlanFacilityContext,
    craftScopeList,
    makeOrBuyContext,
    accountSkills: ownedStock.accountSkills,
    update,
  });

  // "Use all" / "Use none" run inside the Materials table over every row on
  // it (the rows the per-row offers reach, sub-build inputs included) and
  // share a row edit's toast and Undo (`materialsEditSession.ts`).
  const materialsTable = useRef<MaterialsTableHandle>(null);

  const modals = useMaterialModals({
    plan,
    catalog,
    visibleMaterials,
    effectiveOwnedBlueprints,
    ownedBlueprints,
    corpBlueprints,
    inventionMarket: pricing.inventionMarket,
    modifiers,
    snapshot,
  });

  const { planSchedule, planSeconds } = usePlanJobSchedule(
    plan,
    catalog,
    activity,
    result,
    corpBlueprints
  );

  const materialsExport = usePlanMaterialsExport(
    plan,
    catalog,
    visibleMaterials,
    pricesReady,
    materialAdvice,
    boughtDepth
  );

  const cheaperSystems = useCheaperNearbySystems(
    buildSystem?.id,
    activity,
    snapshot?.systemCostIndex ?? null
  );

  const shopping = useShoppingListCopy(!!result, shoppingMaterials, catalog);

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  // Units produced by the job (per-run product quantity x runs); null when
  // the blueprint has no product. Shared by the Results panel and the
  // Production Runs panel's "Log Production" default below.
  const productQuantity = blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null;

  const { itemMenuFor, itemActionsFor } = buildItemMenuProps(catalog, onSearchBpcSourcing);

  const productUnitPrice =
    entry.productTypeID !== null ? (snapshot?.hubPrices[entry.productTypeID] ?? null) : null;

  const breakdownContext = planBreakdownContext({
    plan,
    catalog,
    hub,
    activity,
    modifiers,
    snapshot,
    costIndexSystemName: buildSystem?.name ?? hub.systemName,
    resolvedMe,
    productName: entry.productName,
    productQuantity,
    productUnitPrice,
    standing,
    planSeconds,
    boughtDepth,
  });

  const lacksBlueprintRow =
    result !== null &&
    !result.materials.some((m) => m.typeID === plan.blueprintTypeID && m.acquisitionTier);

  const { ownedForSale, heroBasis, heroFigures, sellNow } = planHeroFigures({
    result,
    ownedSale,
    saleBasis,
    profitBasis,
    snapshot,
    productTypeID: entry.productTypeID,
    productQuantity,
    productUnitPrice,
    skills: modifiers.skills,
    standing,
  });

  /** Runs at which this plan's profit first reaches zero, applied to the plan. */
  const findBreakEvenRuns = () => {
    const runs = planBreakEvenRuns({
      plan,
      resolveAt,
      heroBasis,
      snapshot,
      saleBasis,
      skills: modifiers.skills,
      standing,
    });
    if (runs !== null) update({ runs });
    return runs;
  };

  const cheapest = cheaperSystems[0];
  const currentIndex = snapshot?.systemCostIndex ?? null;
  const cheaperNearbySaving =
    cheapest && result && currentIndex !== null && currentIndex > 0
      ? moveSaving(result.jobFee, currentIndex, cheapest.index, cheapest.npcStation)
      : 0;
  const cheaperNearbyLine =
    cheapest && cheaperNearbySaving > 0 ? (
      <CheaperNearbyLine cheapest={cheapest} saving={cheaperNearbySaving} movePlan={movePlan} />
    ) : null;

  const setupStrip = (
    <PlanSetupStrip
      open={setupOpen}
      formId={setupFormId}
      onToggle={() => setSetupOpen((open) => !open)}
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

  const renderSetupForm = (className: string) => (
    <PlanSetupForm
      open={setupOpen}
      id={setupFormId}
      className={className}
      plan={plan}
      catalog={catalog}
      activity={activity}
      hub={hub}
      facilityPreset={facilityPreset}
      buildSystem={buildSystem}
      buildLocationName={buildLocationName}
      costIndexMissing={costIndexMissing}
      snapshot={snapshot}
      includeReactions={includeReactions}
      reactionBuildSystem={reactionBuildSystem}
      reactionBuildLocationName={reactionBuildLocationName}
      reactionsInHighsec={reactionsInHighsec}
      bpcCoverage={bpcCoverage}
      groupSnapshot={groupSnapshot}
      update={update}
      movePlan={movePlan}
      toggleIncludeReactions={toggleIncludeReactions}
    />
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
          skillGate={ownedStock.topLevelSkillGate}
          nameForSkill={(typeID) => nameForType(catalog, typeID)}
          nameForCharacter={(characterId) =>
            ownedStock.characterNames.get(characterId) ?? t('common.unknown')
          }
          slotLine={planSchedule && <PlanScheduleLine plan={planSchedule} />}
          vs90dPct={productVs90d ?? null}
          costMoveNote={
            costMove && (
              <InputCostMoveLine
                move={costMove}
                inputName={nameForType(catalog, costMove.topInput.typeID)}
              />
            )
          }
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
        <PlanMaterialsPanel
          plan={plan}
          catalog={catalog}
          hub={hub}
          activity={activity}
          result={result}
          error={error}
          fetchedAt={fetchedAt}
          pricesReady={pricesReady}
          materials={materials}
          ownedStock={ownedStock}
          ownedForSale={ownedForSale}
          corpOwnedStock={corpOwnedStock}
          group={group}
          canBuildHere={canBuildHere}
          autoBuild={{
            maxDepth: autoBuildMaxDepth,
            craftScopeList,
            disabled: !makeOrBuyContext,
            onApply: applyAutoBuild,
          }}
          shopping={shopping}
          materialsExport={materialsExport}
          materialsTable={materialsTable}
          modals={modals}
          itemMenuFor={itemMenuFor}
          itemActionsFor={itemActionsFor}
          update={update}
          changeSourcing={changeSourcing}
          changeOneSourcing={changeOneSourcing}
          toggleBuildHere={toggleBuildHere}
          buildHereAll={buildHereAll}
          onRefresh={() => setRefreshTick((v) => v + 1)}
          onSearchBpcSourcing={onSearchBpcSourcing}
        />

        {result && !error && (
          <PlanCostsPanel
            result={result}
            expanded={costsExpanded}
            onToggle={() => setCostsOpen(!costsExpanded)}
            onShowBreakdown={() => setBreakdownOpen(true)}
            pricesReady={pricesReady}
            pricesUnreachable={pricesUnreachable}
            pricesLoading={pricesLoading}
            snapshot={snapshot}
            heroFigures={heroFigures}
            heroBasis={heroBasis}
            sellNow={sellNow}
            productName={entry.productName}
            productTypeID={entry.productTypeID}
            productUnitPrice={productUnitPrice}
            productQuantity={productQuantity}
            buildSystem={buildSystem}
            hub={hub}
            activity={activity}
            ownedSale={ownedSale}
            saleBasis={saleBasis}
            onSaleBasisChange={setSaleBasis}
            cheaperNearby={cheaperNearbyLine}
            planSeconds={planSeconds}
            totalVolume={materialVolume}
          />
        )}
      </div>

      <ProductionRunsPanel
        blueprintTypeId={plan.blueprintTypeID}
        characterId={plan.characterId}
        buildPlanId={plan.id}
        defaults={productionLogDefaults(jobLogSeed, logRequest, result, productQuantity)}
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
      {shopping.copyState === 'copied' && shopping.blueprintsLeftOut > 0 && (
        <Toast
          message={t('industry.copyShoppingListBlueprintsLeftOut', {
            count: shopping.blueprintsLeftOut,
          })}
        />
      )}
    </div>
  );
}
