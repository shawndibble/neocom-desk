import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, Toast } from '@/components/ui';
import { FACILITY_PRESETS, industryActivityOf } from '@/engine/industry/types';
import type { GroupClaimMember } from '@/engine/industry/groupStockClaims';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
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
import { planStockRuns } from './planStockRuns';
import { offerableStock } from '@/engine/industry/ownedStockOffer';
import { PlanVerdictHero } from './PlanVerdictHero';
import { ProductionRunsPanel } from './ProductionRunsPanel';
import type { MaterialsTableHandle } from './MaterialsTable';
import { productionLogDefaults } from './productionLogDefaults';
import { planBreakEvenRuns } from './planBreakEven';
import { planBreakdownContext } from './planBreakdownContext';
import { planVerdictOf } from './planPricing';
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
import { useProfitBasis } from './profitBasisSetting';
import { usePlanResolution } from './usePlanResolution';
import { useShoppingListCopy } from './useShoppingListCopy';

export type { PlanPatch } from './planPatch';

const NO_GROUP_MEMBERS: readonly GroupClaimMember[] = [];

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
  const includeReactions = plan.includeReactions ?? false;
  const { craftScopeList, reactionPlanFacilityContext, facilityContext } = usePlanFacilityContexts(
    plan,
    activity,
    includeReactions
  );

  const [refreshTick, setRefreshTick] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupFormId = useId();
  const profitBasis = useProfitBasis((state) => state.value);
  const setProfitBasis = useProfitBasis((state) => state.setValue);
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

  useDerivedSecurityBand(buildSystem?.id, hub.security, plan.security, (security) =>
    onChange({ kind: 'derived', patch: { security } })
  );
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
    resolveQuantitiesAt,
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

  const { groupClaimsFor, detection } = ownedStock;
  const stockRuns = useMemo(() => {
    if (!result) return null;
    const found = planStockRuns({
      plan,
      resolveQuantitiesAt,
      availableFor: (typeID) => offerableStock(typeID, groupClaimsFor, detection.scopedQuantityFor),
    });
    return found && { runs: found.runs, limitingTypeID: found.limiting };
  }, [result, plan, resolveQuantitiesAt, groupClaimsFor, detection]);

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

  const shopping = useShoppingListCopy(!!result, shoppingMaterials, catalog, hub);

  if (!entry || !blueprint) {
    return <EmptyState title={t('industry.blueprintMissing')} className="py-8" />;
  }

  const productQuantity = blueprint.products[0] ? blueprint.products[0].quantity * plan.runs : null;

  const { itemMenuFor, itemActionsFor } = buildItemMenuProps(catalog, onSearchBpcSourcing);

  const {
    productUnitPrice,
    priceCapped: productPriceCapped,
    ownedForSale,
    basis: heroBasis,
    figures: heroFigures,
    sellNow,
  } = planVerdictOf(resolved, {
    snapshot,
    productTypeID: entry.productTypeID,
    productQuantity,
    profitBasis,
    saleBasis,
    modifiers,
    standing,
    ownedSale,
  });

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
      stockRuns={
        stockRuns && {
          runs: stockRuns.runs,
          limitingName:
            stockRuns.limitingTypeID === null
              ? null
              : nameForType(catalog, stockRuns.limitingTypeID),
        }
      }
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
          {renderSetupForm('mt-3 border-t border-line pt-3')}
        </Panel>
      )}
      {result && !error && result.revenue !== null && (
        <AssumesBaseStandingsNote
          characterId={plan.characterId}
          hint={t('industry.assumesBaseStandingsHint')}
        />
      )}

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
            productPriceCapped={productPriceCapped}
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
