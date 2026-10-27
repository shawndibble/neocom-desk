/**
 * Invention as a Blueprint Acquisition source (issue #3990): what one
 * attempt costs, its success chance and the expected cost of the T2 copy —
 * with no decryptor and per decryptor, each its own tier so
 * `selectBlueprintTier`'s cheapest-tier pick is the decryptor optimiser.
 * "Expected": luck moves the real cost either way.
 */
import { sum } from '../math';
import type { BpcOffer } from './blueprintAcquisition';
import { estimatedItemValue, jobFee } from './jobCost';
import type { AdjustedPrices, FacilityPreset, IndustryBlueprint } from './types';

/** An invented copy's ME before a decryptor — always 2, whatever the T1 copy's research. */
export const INVENTED_BASE_ME = 2;
/** An invented copy's TE before a decryptor — always 4. */
export const INVENTED_BASE_TE = 4;
/** Copying and invention fees are charged on this share of the built item's EIV. */
const RESEARCH_JOB_EIV_SHARE = 0.02;

/** The trained levels an invention job reads. */
export interface InventionSkillLevels {
  /** The recipe's science skills (two for every T2 recipe). */
  science: readonly number[];
  /** The recipe's racial Encryption Methods skill. */
  encryption: number;
}

/**
 * Success chance of one attempt:
 * base × (1 + Σscience/30 + encryption/40) × decryptor multiplier, capped at 1.
 */
export function inventionChance(
  baseProbability: number,
  skills: InventionSkillLevels,
  probabilityMultiplier = 1
): number {
  const science = sum(skills.science);
  const chance =
    baseProbability * (1 + science / 30 + skills.encryption / 40) * probabilityMultiplier;
  return Math.min(1, chance);
}

/** One datacore an attempt consumes, at its hub price (`null` = unpriced). */
export interface InventionDatacoreInput {
  typeID: number;
  quantity: number;
  unitPrice: number | null;
}

/** One decryptor, its SDE modifiers and its hub price (`null` = unpriced). */
export interface InventionDecryptorInput {
  typeID: number;
  name: string;
  probabilityMultiplier: number;
  me: number;
  te: number;
  runs: number;
  unitPrice: number | null;
}

export interface InventionQuoteInputs {
  /** The recipe's base chance (SDE), 0–1. */
  baseProbability: number;
  /** Runs on the invented copy before a decryptor (SDE). */
  baseRuns: number;
  skills: InventionSkillLevels;
  datacores: readonly InventionDatacoreInput[];
  /** The 1-run T1 copy job; `null` when it can't run (no T1 original). */
  copyJobFee: number | null;
  inventionJobFee: number;
  decryptors: readonly InventionDecryptorInput[];
}

export interface InventionDatacoreLine extends InventionDatacoreInput {
  /** quantity × unitPrice; null when unpriced. */
  lineCost: number | null;
}

/** One way to invent: no decryptor, or one decryptor. */
export interface InventionTier {
  /** `null` = no decryptor. */
  decryptor: { typeID: number; name: string; unitPrice: number | null } | null;
  chance: number;
  me: number;
  te: number;
  runs: number;
  /** Datacores + decryptor + copy job + invention fee; null when any is unpriced. */
  attemptCost: number | null;
  /** attemptCost ÷ chance. */
  expectedCostPerCopy: number | null;
  /** expectedCostPerCopy ÷ runs. */
  expectedCostPerRun: number | null;
}

export interface InventionQuote {
  datacores: InventionDatacoreLine[];
  /** Every datacore line summed; null when any is unpriced. */
  datacoreCost: number | null;
  copyJobFee: number | null;
  inventionJobFee: number;
  /** The chance with no decryptor. */
  chance: number;
  /** One attempt before a decryptor; null when anything in it is unpriced. */
  attemptCost: number | null;
  /** No decryptor first, then one per decryptor in input order. */
  tiers: InventionTier[];
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

function tierFor(
  inputs: InventionQuoteInputs,
  baseAttempt: number | null,
  decryptor: InventionDecryptorInput | null
): InventionTier {
  const chance = inventionChance(
    inputs.baseProbability,
    inputs.skills,
    decryptor?.probabilityMultiplier ?? 1
  );
  const runs = Math.max(1, inputs.baseRuns + (decryptor?.runs ?? 0));
  const attemptCost =
    baseAttempt === null ? null : sumOrNull([baseAttempt, decryptor ? decryptor.unitPrice : 0]);
  const expectedCostPerCopy = attemptCost === null || chance <= 0 ? null : attemptCost / chance;
  return {
    decryptor: decryptor
      ? { typeID: decryptor.typeID, name: decryptor.name, unitPrice: decryptor.unitPrice }
      : null,
    chance,
    me: Math.max(0, INVENTED_BASE_ME + (decryptor?.me ?? 0)),
    te: Math.max(0, INVENTED_BASE_TE + (decryptor?.te ?? 0)),
    runs,
    attemptCost,
    expectedCostPerCopy,
    expectedCostPerRun: expectedCostPerCopy === null ? null : expectedCostPerCopy / runs,
  };
}

/** Every invention tier for one recipe, priced. Never throws. */
export function inventionQuote(inputs: InventionQuoteInputs): InventionQuote {
  const datacores = inputs.datacores.map((d): InventionDatacoreLine => ({
    ...d,
    lineCost: d.unitPrice === null ? null : d.quantity * d.unitPrice,
  }));
  const datacoreCost = sumOrNull(datacores.map((d) => d.lineCost));
  const attemptCost = sumOrNull([datacoreCost, inputs.copyJobFee, inputs.inventionJobFee]);
  return {
    datacores,
    datacoreCost,
    copyJobFee: inputs.copyJobFee,
    inventionJobFee: inputs.inventionJobFee,
    chance: inventionChance(inputs.baseProbability, inputs.skills),
    attemptCost,
    tiers: [null, ...inputs.decryptors].map((d) => tierFor(inputs, attemptCost, d)),
  };
}

/**
 * Each priced tier as a one-copy offer at its expected cost per copy, so
 * automatic selection weighs invention on total cost like any listing.
 */
export function inventionOffers(quote: InventionQuote): BpcOffer[] {
  return quote.tiers.flatMap((tier) =>
    tier.expectedCostPerCopy === null
      ? []
      : [
          {
            me: tier.me,
            te: tier.te,
            runs: tier.runs,
            quantity: 1,
            price: tier.expectedCostPerCopy,
            invented: true as const,
          },
        ]
  );
}

/**
 * One copying or invention job's fee: the usual job fee, charged on 2% of
 * one run's estimated item value of what the blueprint builds — the T1
 * product for a 1-run copy, the T2 product for invention.
 */
export function researchJobFee(
  builtBy: Pick<IndustryBlueprint, 'materials'>,
  adjustedPrices: AdjustedPrices,
  systemCostIndex: number,
  facility: FacilityPreset,
  facilityTaxPct?: number
): number {
  const eiv = estimatedItemValue(builtBy, 1, adjustedPrices);
  return jobFee(eiv * RESEARCH_JOB_EIV_SHARE, systemCostIndex, facility, facilityTaxPct).total;
}
