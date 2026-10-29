import { describe, expect, it } from 'vitest';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { makeOrBuyLabel, makeOrBuyReason, makeOrBuyVerdict } from './makeOrBuyText';
import type { Translate } from '@/lib/translate';

/** Echoes the key, so the assertions read as "which strings were asked for". */
const t: Translate = (key, opts) => (opts?.verdict ? `${key}:${String(opts.verdict)}` : key);

const advice = (patch: Partial<MakeOrBuy> = {}): MakeOrBuy => ({
  verdict: 'build',
  method: 'manufacturing',
  makeUnitPrice: 5.4,
  buyUnitPrice: 5.6,
  me: 10,
  blueprintCost: 0,
  savings: 0,
  ...patch,
});

describe('makeOrBuyText', () => {
  it('names the verdict through the build/buy action key', () => {
    expect(makeOrBuyVerdict(advice(), t)).toBe(
      'industry.makeOrBuy.suggestion:industry.makeOrBuy.actionBuild'
    );
    expect(makeOrBuyVerdict(advice({ verdict: 'buy' }), t)).toBe(
      'industry.makeOrBuy.suggestion:industry.makeOrBuy.actionBuy'
    );
  });

  it.each([
    ['manufacturing', 'reasonManufacturing'],
    ['reaction', 'reasonReaction'],
    ['planetary', 'reasonPlanetary'],
  ] as const)('picks the %s reason string', (method, key) => {
    expect(makeOrBuyReason(advice({ method }), 0, t)).toBe(`industry.makeOrBuy.${key}`);
  });

  it('adds the blueprint cost, and savings only with a remainder to spend them on', () => {
    const a = advice({ blueprintCost: 100, savings: 50 });
    expect(makeOrBuyReason(a, 0, t)).toBe(
      'industry.makeOrBuy.reasonManufacturing industry.makeOrBuy.blueprintCost'
    );
    expect(makeOrBuyReason(a, 3, t)).toBe(
      'industry.makeOrBuy.reasonManufacturing industry.makeOrBuy.blueprintCost industry.makeOrBuy.savings'
    );
  });

  it('joins verdict and reason for the accessible label', () => {
    expect(makeOrBuyLabel(advice(), 0, t)).toBe(
      'industry.makeOrBuy.suggestion:industry.makeOrBuy.actionBuild. industry.makeOrBuy.reasonManufacturing'
    );
  });
});
