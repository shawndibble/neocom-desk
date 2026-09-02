/**
 * Build-vs-buy comparison: total build cost (materials at hub sell prices +
 * job fee) against buying the product outright at the hub's lowest sell.
 * Missing hub prices flag the result as unpriceable instead of throwing.
 */

import type { BuildResult, FacilityContext, IndustryInputs } from '@/engine/industry/types';
import { SKILL_IDS } from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import { jobDurationSeconds } from '@/engine/industry/time';
import { estimatedItemValue, jobFee } from '@/engine/industry/jobCost';
import { brokerFee, breakEvenPrice, salesTax } from '@/engine/industry/fees';

export function buildVsBuy(inputs: IndustryInputs): BuildResult {
  const { blueprint, runs, me, te, systemCostIndex, adjustedPrices, hubPrices, skills } = inputs;
  const ctx: FacilityContext = {
    facility: inputs.facility,
    rig: inputs.rig,
    security: inputs.security,
  };

  const materials = effectiveMaterials(blueprint, runs, me, ctx);
  const seconds = jobDurationSeconds(blueprint.time, runs, te, skills, ctx);
  const fee = jobFee(
    estimatedItemValue(blueprint, runs, adjustedPrices),
    systemCostIndex,
    inputs.facility,
    inputs.facilityTaxPct
  );

  const unpricedMaterials = materials
    .filter(({ typeID }) => hubPrices[typeID] === undefined)
    .map(({ typeID }) => typeID);
  const materialCost = materials.reduce(
    (sum, { typeID, quantity }) => sum + quantity * (hubPrices[typeID] ?? 0),
    0
  );
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
