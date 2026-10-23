/**
 * SRP Reimbursement chain (epic #4608, ADR 0026). Pure: no fetch/DOM/Dexie.
 *
 * Chain:
 *  1. Hull Rule Pay with a fixed ISK amount for the hull, else its class
 *     (a hull's rule of any mode beats the class's rule).
 *  2. Else killmail value x the corp's killmail percent.
 *  3. Else Jita Appraisal value of the killmail's items x Appraisal percent.
 *  4. Else no amount: the officer types it.
 * Not covered -> refused. Officer decides -> never a computed amount, but the
 * percent-chain value (steps 2-3) comes back as `suggested`.
 *
 * Percents are corp-set, valid 0-100 inclusive; anything else (null, blank,
 * NaN, out of range) is unset and skips its step. 0 is a set percent and pays 0.
 * Values / fixed ISK that are null, NaN, infinite or negative count as missing.
 * Amounts are whole ISK, rounded down.
 */

export type SrpHullRule =
  | {
      mode: 'pay';
      /** Fixed ISK; null/blank/invalid = the corp's percent of value. */ fixedIsk?: number | null;
    }
  | { mode: 'not-covered' }
  | { mode: 'officer' };

export interface SrpPricingInput {
  hullTypeId: number;
  /** Hull class (market group / ship group) id. */
  classId: number;
  hullRules: Readonly<Record<number, SrpHullRule | undefined>>;
  classRules: Readonly<Record<number, SrpHullRule | undefined>>;
  /** zKillboard value; null when unavailable. */
  killmailValue: number | null | undefined;
  /** Jita Appraisal of the killmail's items; null when unavailable. */
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
  typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100;

const validAmount = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

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
