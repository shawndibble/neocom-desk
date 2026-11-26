import { sum } from '../math';
import type { BpcOffer } from './blueprintAcquisition';
import { estimatedItemValue, jobFee } from './jobCost';
import type { AdjustedPrices, FacilityPreset, IndustryBlueprint } from './types';

export const INVENTED_BASE_ME = 2;
export const INVENTED_BASE_TE = 4;
const RESEARCH_JOB_EIV_SHARE = 0.02;

export interface InventionSkillLevels {
  science: readonly number[];
  encryption: number;
}

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

export interface InventionDatacoreInput {
  typeID: number;
  quantity: number;
  unitPrice: number | null;
}

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
  baseProbability: number;
  baseRuns: number;
  skills: InventionSkillLevels;
  datacores: readonly InventionDatacoreInput[];
  copyJobFee: number | null;
  inventionJobFee: number;
  decryptors: readonly InventionDecryptorInput[];
}

export interface InventionDatacoreLine extends InventionDatacoreInput {
  lineCost: number | null;
}

export interface InventionTier {
  decryptor: { typeID: number; name: string; unitPrice: number | null } | null;
  chance: number;
  me: number;
  te: number;
  runs: number;
  attemptCost: number | null;
  expectedCostPerCopy: number | null;
  expectedCostPerRun: number | null;
}

export interface InventionQuote {
  datacores: InventionDatacoreLine[];
  datacoreCost: number | null;
  copyJobFee: number | null;
  inventionJobFee: number;
  chance: number;
  attemptCost: number | null;
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
