export type SrpHullRule =
  | {
      mode: 'pay';
      fixedIsk?: number | null;
    }
  | { mode: 'not-covered' }
  | { mode: 'officer' };

export interface SrpPricingInput {
  hullTypeId: number;
  classId: number;
  hullRules: Readonly<Record<number, SrpHullRule | undefined>>;
  classRules: Readonly<Record<number, SrpHullRule | undefined>>;
  killmailValue: number | null | undefined;
  appraisalValue: number | null | undefined;
  killmailPercent?: number | null;
  appraisalPercent?: number | null;
}

export type SrpBasis =
  | { step: 'hull-fixed' }
  | { step: 'class-fixed' }
  | { step: 'killmail-percent'; percent: number }
  | { step: 'appraisal-percent'; percent: number };

export interface SrpSuggestion {
  isk: number;
  basis: SrpBasis;
}

export type SrpPricingResult =
  | { kind: 'amount'; isk: number; basis: SrpBasis }
  | { kind: 'officer'; reason: 'officer-decides' | 'no-amount'; suggested?: SrpSuggestion }
  | { kind: 'refused'; reason: 'not-covered' };

const validPercent = (p: number | null | undefined): p is number =>
  typeof p === 'number' && Number.isFinite(p) && p >= 1 && p <= 100;

const validAmount = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 1;

function percentChain(input: SrpPricingInput): SrpSuggestion | null {
  const { killmailValue, killmailPercent, appraisalValue, appraisalPercent } = input;
  if (validPercent(killmailPercent) && validAmount(killmailValue)) {
    return {
      isk: Math.floor((killmailValue * killmailPercent) / 100),
      basis: { step: 'killmail-percent', percent: killmailPercent },
    };
  }
  if (validPercent(appraisalPercent) && validAmount(appraisalValue)) {
    return {
      isk: Math.floor((appraisalValue * appraisalPercent) / 100),
      basis: { step: 'appraisal-percent', percent: appraisalPercent },
    };
  }
  return null;
}

export function priceSrpClaim(input: SrpPricingInput): SrpPricingResult {
  const hullRule = input.hullRules[input.hullTypeId];
  const classRule = hullRule ? undefined : input.classRules[input.classId];
  const rule = hullRule ?? classRule;

  if (rule?.mode === 'not-covered') return { kind: 'refused', reason: 'not-covered' };

  if (rule?.mode === 'officer') {
    const suggested = percentChain(input);
    return suggested
      ? { kind: 'officer', reason: 'officer-decides', suggested }
      : { kind: 'officer', reason: 'officer-decides' };
  }

  if (rule?.mode === 'pay' && validAmount(rule.fixedIsk)) {
    return {
      kind: 'amount',
      isk: Math.floor(rule.fixedIsk),
      basis: { step: hullRule ? 'hull-fixed' : 'class-fixed' },
    };
  }

  const chain = percentChain(input);
  return chain ? { kind: 'amount', ...chain } : { kind: 'officer', reason: 'no-amount' };
}
