/**
 * Build-vs-buy comparison: total build cost (materials at their sourced prices
 * + job fee) against buying the product outright at the hub's lowest sell.
 * Material prices come from src/engine/industry/materialResolution — owned
 * units are free, the rest is priced at an override, at `materialPrices` (the
 * hub's sell side unless the caller passes another map), or — for a material
 * named in `buildHere` — the rolled-up cost of the job that produces it,
 * recursively. Missing prices flag the result as unpriceable instead of
 * throwing; so does a built material that bottoms out unpriced.
 *
 * The product is always priced from `hubPrices`, never `materialPrices`: an
 * Acquisition Verdict asks what buying the product outright costs, and buying
 * outright pays the hub's lowest sell whatever the materials were sourced at.
 */

import type { BuildResult, IndustryInputs } from '@/engine/industry/types';
import { SKILL_IDS } from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import { resolveMaterial, unpricedLeafTypeIds } from '@/engine/industry/materialResolution';
import type { SubBuildContext } from '@/engine/industry/subBuild';
import { jobDurationSeconds } from '@/engine/industry/time';
import { estimatedItemValue, jobFee } from '@/engine/industry/jobCost';
import { brokerFee, breakEvenPrice, salesTax } from '@/engine/industry/fees';

export function buildVsBuy(inputs: IndustryInputs): BuildResult {
  const { blueprint, runs, me, te, systemCostIndex, adjustedPrices, hubPrices, skills } = inputs;
  const ctx: SubBuildContext = {
    facility: inputs.facility,
    rig: inputs.rig,
    security: inputs.security,
    facilityTaxPct: inputs.facilityTaxPct,
    systemCostIndex,
    adjustedPrices,
    skills,
  };

  // One shared pool across every top-level material's own resolution, not one
  // per `.map()` iteration: two different blueprint materials can each build
  // down into the same recursive input (e.g. two components both consuming
  // Tritanium), and owned stock of it exists once, not once per branch.
  const ownedPool = new Map<number, number>();
  const materials = effectiveMaterials(blueprint, runs, me, ctx).map((material) =>
    resolveMaterial(material, {
      buildHere: new Set(inputs.buildHere ?? []),
      recipeFor: inputs.recipeFor ?? (() => null),
      materialPrices: inputs.materialPrices ?? hubPrices,
      sourcing: inputs.materialSourcing,
      ctx,
      ownedPool,
    })
  );
  const seconds = jobDurationSeconds(blueprint.time, runs, te, skills, ctx);
  const fee = jobFee(
    estimatedItemValue(blueprint, runs, adjustedPrices),
    systemCostIndex,
    inputs.facility,
    inputs.facilityTaxPct
  );

  // The actual blocking typeIDs, however deep they sit — a built material's
  // own `unpriced` flag only ever reflects something underneath it, so its
  // own typeID is never the right thing to report here.
  const unpricedMaterials = unpricedLeafTypeIds(materials);
  const materialCost = materials.reduce((sum, { lineCost }) => sum + lineCost, 0);
  const totalCost = materialCost + fee.total;

  const product = blueprint.products[0];
  const productPrice = product ? hubPrices[product.typeID] : undefined;
  const productPriced = productPrice !== undefined;
  const unpriceable = unpricedMaterials.length > 0 || !productPriced;

  const revenue = productPriced ? product.quantity * runs * productPrice : null;
  const tax = revenue === null ? null : salesTax(revenue, skills[SKILL_IDS.accounting] ?? 0);
  const broker =
    revenue === null ? null : brokerFee(revenue, skills[SKILL_IDS.brokerRelations] ?? 0);
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
    skills[SKILL_IDS.brokerRelations] ?? 0
  );

  return {
    materials,
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
