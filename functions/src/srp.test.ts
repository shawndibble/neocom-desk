import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseSrpSettingsPatch } from './srp.js';

const fails = (data: unknown) => {
  try {
    parseSrpSettingsPatch(data);
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return (err as HttpsError).message;
  }
  throw new Error('expected a failure');
};

describe('parseSrpSettingsPatch', () => {
  it('takes percents, window, fleet flag and hull rules of every kind', () => {
    expect(
      parseSrpSettingsPatch({
        killmailPct: 80,
        appraisalPct: null,
        windowDays: 14,
        requireFleetOrFc: true,
        hullRules: [
          { scope: 'hull', id: 587, kind: 'pay-fixed', iskAmount: 5_000_000 },
          { scope: 'class', id: 25, kind: 'pay-percent' },
          { scope: 'hull', id: 11, kind: 'not-covered' },
          { scope: 'class', id: 27, kind: 'officer-decides' },
        ],
      })
    ).toEqual({
      killmailPct: 80,
      appraisalPct: null,
      windowDays: 14,
      requireFleetOrFc: true,
      hullRules: [
        { scope: 'hull', id: 587, kind: 'pay-fixed', iskAmount: 5_000_000 },
        { scope: 'class', id: 25, kind: 'pay-percent' },
        { scope: 'hull', id: 11, kind: 'not-covered' },
        { scope: 'class', id: 27, kind: 'officer-decides' },
      ],
    });
  });

  it('keeps only the fields given and refuses an empty patch', () => {
    expect(parseSrpSettingsPatch({ windowDays: 30 })).toEqual({ windowDays: 30 });
    expect(fails({})).toMatch(/no settings/);
    expect(fails({ corporationId: 1 })).toMatch(/no settings/);
  });

  it('bounds percents and the window', () => {
    expect(fails({ killmailPct: 101 })).toMatch(/killmailPct/);
    expect(fails({ appraisalPct: -1 })).toMatch(/appraisalPct/);
    expect(fails({ killmailPct: 0 })).toMatch(/killmailPct/);
    expect(fails({ appraisalPct: 0.5 })).toMatch(/appraisalPct/);
    expect(parseSrpSettingsPatch({ killmailPct: 1, appraisalPct: 100 })).toEqual({
      killmailPct: 1,
      appraisalPct: 100,
    });
    expect(fails({ killmailPct: 'x' })).toMatch(/killmailPct/);
    expect(fails({ windowDays: 0 })).toMatch(/windowDays/);
    expect(fails({ windowDays: 366 })).toMatch(/windowDays/);
    expect(fails({ windowDays: 1.5 })).toMatch(/windowDays/);
    expect(fails({ requireFleetOrFc: 'yes' })).toMatch(/requireFleetOrFc/);
  });

  it('validates each Hull Rule and drops stray fields', () => {
    expect(fails({ hullRules: [{ scope: 'fleet', id: 1, kind: 'not-covered' }] })).toMatch(/scope/);
    expect(fails({ hullRules: [{ scope: 'hull', id: 0, kind: 'not-covered' }] })).toMatch(/id/);
    expect(fails({ hullRules: [{ scope: 'hull', id: 1, kind: 'free' }] })).toMatch(/kind/);
    expect(fails({ hullRules: [{ scope: 'hull', id: 1, kind: 'pay-fixed' }] })).toMatch(
      /iskAmount/
    );
    expect(
      fails({ hullRules: [{ scope: 'hull', id: 1, kind: 'pay-fixed', iskAmount: 0 }] })
    ).toMatch(/iskAmount/);
    expect(
      fails({ hullRules: [{ scope: 'hull', id: 1, kind: 'pay-fixed', iskAmount: 0.5 }] })
    ).toMatch(/iskAmount/);
    // A legacy stored pct is ignored, not refused.
    expect(
      parseSrpSettingsPatch({
        hullRules: [{ scope: 'hull', id: 1, kind: 'pay-percent', pct: 120 }],
      }).hullRules
    ).toEqual([{ scope: 'hull', id: 1, kind: 'pay-percent' }]);
    expect(
      parseSrpSettingsPatch({
        hullRules: [{ scope: 'hull', id: 1, kind: 'not-covered', iskAmount: 9, pct: 9, x: 1 }],
      }).hullRules
    ).toEqual([{ scope: 'hull', id: 1, kind: 'not-covered' }]);
  });

  it('refuses a duplicate hull or class and an over-long list; allows clearing the list', () => {
    const rule = { scope: 'hull', id: 1, kind: 'not-covered' };
    expect(fails({ hullRules: [rule, rule] })).toMatch(/twice/);
    expect(
      parseSrpSettingsPatch({
        hullRules: [rule, { scope: 'class', id: 1, kind: 'not-covered' }],
      }).hullRules
    ).toHaveLength(2);
    expect(
      fails({
        hullRules: Array.from({ length: 501 }, (_, i) => ({
          scope: 'hull',
          id: i + 1,
          kind: 'not-covered',
        })),
      })
    ).toMatch(/at most 500/);
    expect(parseSrpSettingsPatch({ hullRules: [] })).toEqual({ hullRules: [] });
  });
});
