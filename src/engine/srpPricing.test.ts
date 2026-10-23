import { describe, it, expect } from 'vitest';
import { priceSrpClaim, type SrpPricingInput } from '@/engine/srpPricing';

const base: SrpPricingInput = {
  hullTypeId: 100,
  classId: 10,
  hullRules: {},
  classRules: {},
  killmailValue: null,
  appraisalValue: null,
  killmailPercent: null,
  appraisalPercent: null,
};
const price = (over: Partial<SrpPricingInput>) => priceSrpClaim({ ...base, ...over });

describe('Hull Rule Pay with fixed ISK', () => {
  it('pays the hull fixed amount', () => {
    expect(price({ hullRules: { 100: { mode: 'pay', fixedIsk: 50_000_000 } } })).toEqual({
      kind: 'amount',
      isk: 50_000_000,
      basis: { step: 'hull-fixed' },
    });
  });
  it('pays the class fixed amount when the hull has no rule', () => {
    expect(price({ classRules: { 10: { mode: 'pay', fixedIsk: 7_000_000 } } })).toEqual({
      kind: 'amount',
      isk: 7_000_000,
      basis: { step: 'class-fixed' },
    });
  });
  it('hull rule beats class rule, even Not covered over a class Pay', () => {
    const r = price({
      hullRules: { 100: { mode: 'not-covered' } },
      classRules: { 10: { mode: 'pay', fixedIsk: 1 } },
    });
    expect(r).toEqual({ kind: 'refused', reason: 'not-covered' });
  });
  it('rounds a fractional fixed amount down', () => {
    const r = price({ hullRules: { 100: { mode: 'pay', fixedIsk: 12.9 } } });
    expect(r).toMatchObject({ kind: 'amount', isk: 12 });
  });
});

describe('Hull Rule Pay at the corp percent', () => {
  const rule = { 100: { mode: 'pay' as const, fixedIsk: null } };
  it('uses killmail value x killmail percent', () => {
    expect(price({ hullRules: rule, killmailValue: 1_000_001, killmailPercent: 50 })).toEqual({
      kind: 'amount',
      isk: 500_000,
      basis: { step: 'killmail-percent', percent: 50 },
    });
  });
  it('falls to appraisal when killmail value is missing', () => {
    expect(
      price({
        hullRules: rule,
        killmailPercent: 50,
        appraisalValue: 200,
        appraisalPercent: 90,
      })
    ).toEqual({ kind: 'amount', isk: 180, basis: { step: 'appraisal-percent', percent: 90 } });
  });
  it('has no computed amount when no percent is set', () => {
    expect(price({ hullRules: rule, killmailValue: 5 })).toEqual({
      kind: 'officer',
      reason: 'no-amount',
    });
  });
});

describe('percent chain with no Hull Rule', () => {
  it('runs killmail percent first', () => {
    expect(
      price({ killmailValue: 1000, killmailPercent: 80, appraisalValue: 9, appraisalPercent: 100 })
    ).toMatchObject({ kind: 'amount', isk: 800, basis: { step: 'killmail-percent' } });
  });
  it('skips a blank or unset percent', () => {
    expect(
      price({
        killmailValue: 1000,
        killmailPercent: null,
        appraisalValue: 400,
        appraisalPercent: 50,
      })
    ).toMatchObject({
      isk: 200,
      basis: { step: 'appraisal-percent', percent: 50 },
    });
    expect(price({ killmailValue: 1000, killmailPercent: undefined })).toEqual({
      kind: 'officer',
      reason: 'no-amount',
    });
  });
  it('falls to officer entry when values are missing', () => {
    expect(price({ killmailPercent: 50, appraisalPercent: 50 })).toEqual({
      kind: 'officer',
      reason: 'no-amount',
    });
  });
  it('treats 0 percent as unset and falls through', () => {
    expect(
      price({ killmailValue: 1000, killmailPercent: 0, appraisalValue: 400, appraisalPercent: 50 })
    ).toMatchObject({ isk: 200, basis: { step: 'appraisal-percent' } });
  });
  it('treats out-of-range percents as unset', () => {
    for (const p of [-1, 0.5, 100.5, 150, NaN, Infinity]) {
      expect(price({ killmailValue: 1000, killmailPercent: p })).toEqual({
        kind: 'officer',
        reason: 'no-amount',
      });
    }
  });
  it('treats negative or NaN values as missing', () => {
    for (const v of [-5, 0, NaN, Infinity]) {
      expect(
        price({ killmailValue: v, killmailPercent: 50, appraisalValue: 100, appraisalPercent: 50 })
      ).toMatchObject({ isk: 50, basis: { step: 'appraisal-percent' } });
    }
  });
});

describe('Officer decides', () => {
  const rule = { 100: { mode: 'officer' as const } };
  it('has no amount but suggests the percent-chain value', () => {
    expect(price({ hullRules: rule, killmailValue: 1000, killmailPercent: 25 })).toEqual({
      kind: 'officer',
      reason: 'officer-decides',
      suggested: { isk: 250, basis: { step: 'killmail-percent', percent: 25 } },
    });
  });
  it('omits suggested when the chain gives nothing', () => {
    const r = price({ hullRules: rule });
    expect(r).toEqual({ kind: 'officer', reason: 'officer-decides' });
    expect('suggested' in r).toBe(false);
  });
});

describe('invalid fixed ISK', () => {
  it('falls back to the percent chain', () => {
    for (const f of [-1, 0, 0.5, NaN, Infinity]) {
      expect(
        price({
          hullRules: { 100: { mode: 'pay', fixedIsk: f } },
          killmailValue: 100,
          killmailPercent: 10,
        })
      ).toMatchObject({ isk: 10, basis: { step: 'killmail-percent' } });
    }
  });
});

describe('property: amount is a non-negative integer', () => {
  it('holds across a sweep of inputs', () => {
    const nums = [-1e9, -1, 0, 0.5, 1, 33.3, 999_999.99, 1e12, NaN, Infinity, null, undefined];
    const pcts = [-5, 0, 0.1, 33.33, 99.99, 100, 101, NaN, null, undefined];
    const rules = [
      undefined,
      { mode: 'pay' as const, fixedIsk: null },
      { mode: 'pay' as const, fixedIsk: 12.7 },
      { mode: 'officer' as const },
    ];
    for (const kv of nums)
      for (const av of nums)
        for (const kp of pcts)
          for (const ap of pcts)
            for (const rule of rules) {
              const r = price({
                hullRules: rule ? { 100: rule } : {},
                killmailValue: kv as number | null,
                appraisalValue: av as number | null,
                killmailPercent: kp as number | null,
                appraisalPercent: ap as number | null,
              });
              const amounts =
                r.kind === 'amount'
                  ? [r.isk]
                  : r.kind === 'officer' && r.suggested
                    ? [r.suggested.isk]
                    : [];
              for (const a of amounts) {
                expect(Number.isInteger(a)).toBe(true);
                expect(a).toBeGreaterThanOrEqual(0);
              }
            }
  });
});
