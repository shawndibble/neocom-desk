/**
 * Invention as a Blueprint Acquisition source (issue #3990):
 * `loadInventionMarket` loads recipes and hub prices per (Trade Hub,
 * blueprints); `inventionQuoteFor` / `inventionOffersLookup` price them per
 * plan (cost indices, facility, owned T1 originals, skills).
 */
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
import { loadInvention, loadSkills } from '@/sde/loadSde';
import type { InventionData, SkillType } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';

/** The skill group every invention science and encryption skill sits in. */
const SCIENCE_SKILL_GROUP_ID = 270;
const ENCRYPTION_SKILL_SUFFIX = 'Encryption Methods';

export interface InventionSkill {
  typeID: number;
  name: string;
}

/** What inventing one T2 blueprint takes, from the SDE. */
export interface InventionRecipeInfo {
  /** The T1 blueprint copied and invented from. */
  t1BlueprintTypeID: number;
  baseProbability: number;
  /** Runs on the invented copy before a decryptor. */
  baseRuns: number;
  /** Datacores one attempt consumes. */
  datacores: readonly { typeID: number; quantity: number }[];
  /** The science skills the chance reads. */
  scienceSkills: readonly InventionSkill[];
  encryptionSkill: InventionSkill | null;
}

/** Recipes and hub prices for one (Trade Hub, blueprints) load. */
export interface InventionMarket {
  /** The recipe that invents this blueprint, or null when nothing does. */
  recipeFor: (blueprintTypeID: number) => InventionRecipeInfo | null;
  decryptors: readonly Omit<InventionDecryptorInput, 'unitPrice'>[];
  /** Hub sell price of a datacore or decryptor; null when none. */
  unitPriceFor: (typeID: number) => number | null;
}

/**
 * The recipes inventing any of `blueprintTypeIds`, keyed by the invented
 * blueprint. "… Encryption Methods" is the encryption skill, every other
 * Science-group skill a science skill; production skills don't count.
 */
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

/**
 * Loads the recipes inventing any of `blueprintTypeIds` and prices their
 * datacores and every decryptor at `hub`. Null when none of them is invented
 * — no price request is made then. Never rejects: unreadable data reads as
 * no market, unreadable prices as none (tiers unpriced, never free).
 */
export function loadInventionMarket(
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
): Promise<InventionMarket | null> {
  return loadMarket(hub, blueprintTypeIds).catch(() => null);
}

async function loadMarket(
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
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
    unitPriceFor: (id) => prices.get(id)?.sellMin ?? null,
  };
}

/** Everything one plan's invention quote reads beyond the market load. */
export interface InventionPricingContext {
  market: InventionMarket;
  catalog: Pick<BlueprintCatalog, 'byBlueprintTypeID'>;
  /** The plan's owned blueprints — personal, plus corp when its Corp Assets toggle is on. */
  ownedBlueprints: readonly Pick<CharacterBlueprint, 'type_id' | 'runs'>[];
  skills: SkillLevels;
  /** Where the plan's jobs run; its copy and invention jobs run there too. */
  facility: FacilityPreset;
  facilityTaxPct?: number;
  adjustedPrices: AdjustedPrices;
  copyingCostIndex: number;
  inventionCostIndex: number;
}

/** One blueprint's invention quote, with what it was worked out from. */
export interface InventionQuoteResult {
  recipe: InventionRecipeInfo;
  quote: InventionQuote;
  skills: InventionSkillLevels;
}

/** The quote for inventing `blueprintTypeID`, or null when nothing invents it. */
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
    // No T1 original: the copy job can't run, so every tier stays unpriced.
    copyJobFee: ownsT1Original ? fee(t1.blueprint, ctx.copyingCostIndex) : null,
    inventionJobFee: fee(t2.blueprint, ctx.inventionCostIndex),
    decryptors: ctx.market.decryptors.map((d) => ({
      ...d,
      unitPrice: ctx.market.unitPriceFor(d.typeID),
    })),
  });
  return { recipe, quote, skills };
}

/** Each blueprint's priced invention tiers as offers, memoised per blueprint. */
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
