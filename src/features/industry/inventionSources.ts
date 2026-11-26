import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import {
  inventionOffers,
  inventionQuote,
  researchJobFee,
  type InventionDecryptorInput,
  type InventionQuote,
  type InventionSkillLevels,
} from '@/engine/industry/invention';
import type { AdjustedPrices, FacilityPreset, SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { atPercent } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';
import { loadInvention, loadSkills } from '@/sde/loadSde';
import type { InventionData, SkillType } from '@/sde/types';
import { SCIENCE_SKILL_GROUP_ID } from '@/engine/industry/alphaIndustrySkills';
import type { BlueprintCatalog } from './blueprintCatalog';

const ENCRYPTION_SKILL_SUFFIX = 'Encryption Methods';

export interface InventionSkill {
  typeID: number;
  name: string;
}

export interface InventionRecipeInfo {
  t1BlueprintTypeID: number;
  baseProbability: number;
  baseRuns: number;
  datacores: readonly { typeID: number; quantity: number }[];
  scienceSkills: readonly InventionSkill[];
  encryptionSkill: InventionSkill | null;
}

export interface InventionMarket {
  recipeFor: (blueprintTypeID: number) => InventionRecipeInfo | null;
  decryptors: readonly Omit<InventionDecryptorInput, 'unitPrice'>[];
  unitPriceFor: (typeID: number) => number | null;
}

export function inventionRecipes(
  data: InventionData,
  skills: readonly SkillType[],
  blueprintTypeIds: readonly number[]
): Map<number, InventionRecipeInfo> {
  const wanted = new Set(blueprintTypeIds);
  const skillById = new Map(skills.map((s) => [s.typeID, s]));
  const recipes = new Map<number, InventionRecipeInfo>();
  for (const [key, research] of Object.entries(data.blueprints)) {
    const invention = research.invention;
    if (!invention) continue;
    for (const product of invention.products) {
      if (!wanted.has(product.typeID) || recipes.has(product.typeID)) continue;
      const scienceSkills: InventionSkill[] = [];
      let encryptionSkill: InventionSkill | null = null;
      for (const { typeID } of invention.skills) {
        const known = skillById.get(typeID);
        if (!known || known.groupID !== SCIENCE_SKILL_GROUP_ID) continue;
        const entry = { typeID, name: known.name };
        if (known.name.endsWith(ENCRYPTION_SKILL_SUFFIX)) encryptionSkill = entry;
        else scienceSkills.push(entry);
      }
      recipes.set(product.typeID, {
        t1BlueprintTypeID: Number(key),
        baseProbability: product.probability,
        baseRuns: product.quantity,
        datacores: invention.materials.map((m) => ({ typeID: m.typeID, quantity: m.quantity })),
        scienceSkills,
        encryptionSkill,
      });
    }
  }
  return recipes;
}

export function loadInventionMarket(
  hub: TradeHub,
  blueprintTypeIds: readonly number[],
  pricePercent = DEFAULT_PRICE_PERCENT
): Promise<InventionMarket | null> {
  return loadMarket(hub, blueprintTypeIds, pricePercent).catch(() => null);
}

async function loadMarket(
  hub: TradeHub,
  blueprintTypeIds: readonly number[],
  pricePercent: number
): Promise<InventionMarket | null> {
  if (blueprintTypeIds.length === 0) return null;
  const [data, skills] = await Promise.all([loadInvention(), loadSkills()]);
  const recipes = inventionRecipes(data, skills, blueprintTypeIds);
  if (recipes.size === 0) return null;
  const decryptors = Object.entries(data.decryptors).map(([typeID, d]) => ({
    typeID: Number(typeID),
    ...d,
  }));
  const priceIds = new Set(decryptors.map((d) => d.typeID));
  for (const recipe of recipes.values()) for (const d of recipe.datacores) priceIds.add(d.typeID);
  const prices = await getHubPrices(hub, [...priceIds]).catch(() => new Map());
  return {
    recipeFor: (id) => recipes.get(id) ?? null,
    decryptors,
    unitPriceFor: (id) => {
      const sellMin = prices.get(id)?.sellMin ?? null;
      return sellMin === null ? null : atPercent(sellMin, pricePercent);
    },
  };
}

export interface InventionPricingContext {
  market: InventionMarket;
  catalog: Pick<BlueprintCatalog, 'byBlueprintTypeID'>;
  ownedBlueprints: readonly Pick<CharacterBlueprint, 'type_id' | 'runs'>[];
  skills: SkillLevels;
  facility: FacilityPreset;
  facilityTaxPct?: number;
  adjustedPrices: AdjustedPrices;
  copyingCostIndex: number;
  inventionCostIndex: number;
}

export interface InventionQuoteResult {
  recipe: InventionRecipeInfo;
  quote: InventionQuote;
  skills: InventionSkillLevels;
}

export function inventionQuoteFor(
  blueprintTypeID: number,
  ctx: InventionPricingContext
): InventionQuoteResult | null {
  const recipe = ctx.market.recipeFor(blueprintTypeID);
  if (!recipe) return null;
  const t1 = ctx.catalog.byBlueprintTypeID.get(recipe.t1BlueprintTypeID);
  const t2 = ctx.catalog.byBlueprintTypeID.get(blueprintTypeID);
  if (!t1 || !t2) return null;
  const ownsT1Original = ctx.ownedBlueprints.some(
    (b) => b.type_id === recipe.t1BlueprintTypeID && b.runs === -1
  );
  const fee = (builtBy: typeof t1.blueprint, index: number) =>
    researchJobFee(builtBy, ctx.adjustedPrices, index, ctx.facility, ctx.facilityTaxPct);
  const skills: InventionSkillLevels = {
    science: recipe.scienceSkills.map((s) => ctx.skills[s.typeID] ?? 0),
    encryption: recipe.encryptionSkill ? (ctx.skills[recipe.encryptionSkill.typeID] ?? 0) : 0,
  };
  const quote = inventionQuote({
    baseProbability: recipe.baseProbability,
    baseRuns: recipe.baseRuns,
    skills,
    datacores: recipe.datacores.map((d) => ({
      ...d,
      unitPrice: ctx.market.unitPriceFor(d.typeID),
    })),
    copyJobFee: ownsT1Original ? fee(t1.blueprint, ctx.copyingCostIndex) : null,
    inventionJobFee: fee(t2.blueprint, ctx.inventionCostIndex),
    decryptors: ctx.market.decryptors.map((d) => ({
      ...d,
      unitPrice: ctx.market.unitPriceFor(d.typeID),
    })),
  });
  return { recipe, quote, skills };
}

export function inventionOffersLookup(
  ctx: InventionPricingContext
): (blueprintTypeID: number) => readonly BpcOffer[] {
  const cache = new Map<number, readonly BpcOffer[]>();
  return (blueprintTypeID) => {
    let offers = cache.get(blueprintTypeID);
    if (!offers) {
      const result = inventionQuoteFor(blueprintTypeID, ctx);
      offers = result ? inventionOffers(result.quote) : [];
      cache.set(blueprintTypeID, offers);
    }
    return offers;
  };
}
