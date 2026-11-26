import type { BuildResult, IndustryInputs } from '@/engine/industry/types';
import { SKILL_IDS } from '@/engine/industry/types';
import { splitEffectiveMaterials } from '@/engine/industry/jobSplit';
import {
  acquisitionMaterialFor,
  resolveMaterial,
  unpricedLeafTypeIds,
} from '@/engine/industry/materialResolution';
import type { SubBuildContext } from '@/engine/industry/subBuild';
import { jobDurationSeconds } from '@/engine/industry/time';
import { estimatedItemValue, jobFee } from '@/engine/industry/jobCost';
import { brokerFee, breakEvenPrice, salesTax } from '@/engine/industry/fees';

export function buildVsBuy(inputs: IndustryInputs): BuildResult {
  const {
    blueprint,
    runs,
    me,
    te,
    systemCostIndex,
    regionalTaxPct,
    adjustedPrices,
    hubPrices,
    modifiers,
    standing,
  } = inputs;
  const { skills } = modifiers;
  const ctx: SubBuildContext = {
    facility: inputs.facility,
    rigFit: inputs.rigFit,
    security: inputs.security,
    facilityTaxPct: inputs.facilityTaxPct,
    systemCostIndex,
    regionalTaxPct,
    adjustedPrices,
    modifiers,
  };
  const reactionCtx: SubBuildContext | undefined = inputs.reactionFacility && {
    ...inputs.reactionFacility,
    adjustedPrices,
    modifiers,
  };

  const ownedPool = new Map<number, number>();
  const split = splitEffectiveMaterials(blueprint, runs, me, ctx);
  const resolvedMaterials = split.materials.map((material) =>
    resolveMaterial(material, {
      buildHere: new Set(inputs.buildHere ?? []),
      recipeFor: inputs.recipeFor ?? (() => null),
      materialPrices: inputs.materialPrices ?? hubPrices,
      sourcing: inputs.materialSourcing,
      ctx,
      reactionCtx,
      ownedPool,
      acquisitionFor: inputs.acquisitionFor,
    })
  );

  const acquisitionMaterial = inputs.blueprintAcquisition
    ? acquisitionMaterialFor(
        { me, te, ...inputs.blueprintAcquisition },
        inputs.materialSourcing?.[inputs.blueprintAcquisition.blueprintTypeID]?.overridePrice
      )
    : null;
  const materials = acquisitionMaterial
    ? [acquisitionMaterial, ...resolvedMaterials]
    : resolvedMaterials;

  const seconds = jobDurationSeconds(
    blueprint.time,
    split.jobRuns[0],
    te,
    modifiers,
    ctx,
    blueprint.skills,
    blueprint.rigScope
  );
  const fee = jobFee(
    estimatedItemValue(blueprint, runs, adjustedPrices),
    systemCostIndex,
    inputs.facility,
    inputs.facilityTaxPct,
    regionalTaxPct
  );

  const unpricedMaterials = unpricedLeafTypeIds(materials);
  const materialCost = materials.reduce((sum, { lineCost }) => sum + lineCost, 0);
  const totalCost = materialCost + fee.total;

  const product = blueprint.products[0];
  const productPrice = product ? hubPrices[product.typeID] : undefined;
  const productPriced = productPrice !== undefined;
  const unpriceable = unpricedMaterials.length > 0 || !productPriced;

  const revenue = productPriced ? product.quantity * runs * productPrice : null;
  const tax =
    revenue === null
      ? null
      : salesTax(revenue, skills[SKILL_IDS.accounting] ?? 0, standing?.feeDiscountFactor);
  const broker =
    revenue === null
      ? null
      : brokerFee(
          revenue,
          skills[SKILL_IDS.brokerRelations] ?? 0,
          standing?.factionStanding,
          standing?.corpStanding,
          standing?.safetyTaxPct,
          standing?.feeDiscountFactor
        );
  const netRevenue =
    revenue === null || tax === null || broker === null ? null : revenue - tax - broker;

  let profit: number | null = null;
  let marginPct: number | null = null;
  let iskPerHour: number | null = null;
  let grossProfit: number | null = null;
  let grossMargin: number | null = null;
  let grossIskPerHour: number | null = null;
  let recommendation: BuildResult['recommendation'] = 'unknown';
  if (!unpriceable && revenue !== null && tax !== null && broker !== null) {
    profit = revenue - tax - broker - totalCost;
    marginPct = revenue > 0 ? (profit / revenue) * 100 : null;
    iskPerHour = seconds > 0 ? profit / (seconds / 3600) : null;
    grossProfit = revenue - totalCost;
    grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : null;
    grossIskPerHour = seconds > 0 ? grossProfit / (seconds / 3600) : null;
    recommendation = totalCost <= revenue ? 'build' : 'buy';
  }

  const productQuantity = product ? product.quantity * runs : 0;
  const breakEven = breakEvenPrice(
    totalCost,
    productQuantity,
    skills[SKILL_IDS.accounting] ?? 0,
    skills[SKILL_IDS.brokerRelations] ?? 0,
    standing?.factionStanding,
    standing?.corpStanding,
    standing?.safetyTaxPct,
    standing?.feeDiscountFactor
  );

  return {
    materials,
    jobRuns: split.jobRuns,
    seconds,
    jobFee: fee,
    materialCost,
    totalCost,
    buyCost: revenue,
    revenue,
    salesTax: tax,
    brokerFee: broker,
    netRevenue,
    profit,
    marginPct,
    iskPerHour,
    grossProfit,
    grossMargin,
    grossIskPerHour,
    breakEvenPrice: breakEven,
    unpricedMaterials,
    unpriceable,
    recommendation,
  };
}
