import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  appraisalItems,
  parseFileClaimInput,
  parseKillmailRef,
  pricingInput,
  withinWindow,
} from './srpKillmail.js';
import { priceSrpClaim } from './srpPricing.js';

const HASH = 'a'.repeat(40);

const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpsError);
    return (err as HttpsError).message;
  }
  throw new Error('expected a failure');
};

describe('parseKillmailRef', () => {
  it('takes a zKillboard link, with no hash', () => {
    expect(parseKillmailRef('https://zkillboard.com/kill/123456/')).toEqual({ killmailId: 123456 });
    expect(parseKillmailRef(' https://zkillboard.com/kill/123456 ')).toEqual({
      killmailId: 123456,
    });
  });
  it('takes an ESI link with its hash, any version', () => {
    for (const url of [
      `https://esi.evetech.net/latest/killmails/9/${HASH}/`,
      `https://esi.evetech.net/v1/killmails/9/${HASH}/?datasource=tranquility`,
      `https://esi.evetech.net/killmails/9/${HASH}`,
    ]) {
      expect(parseKillmailRef(url)).toEqual({ killmailId: 9, hash: HASH });
    }
  });
  it('refuses anything else, including other hosts', () => {
    fails(() => parseKillmailRef('https://evil.example/kill/1/'));
    fails(() => parseKillmailRef('https://zkillboard.com/character/1/'));
    fails(() => parseKillmailRef(`https://esi.evetech.net/latest/killmails/9/nothash/`));
    fails(() => parseKillmailRef('12345'));
    fails(() => parseKillmailRef(42));
  });
});

describe('parseFileClaimInput', () => {
  it('trims the optional notes and drops blanks', () => {
    expect(
      parseFileClaimInput({
        killmail: 'https://zkillboard.com/kill/5/',
        fleetOrFc: '  Alpha fleet ',
        note: ' ',
      })
    ).toEqual({ ref: { killmailId: 5 }, fleetOrFc: 'Alpha fleet', note: null });
  });
  it('caps the note length', () => {
    fails(() =>
      parseFileClaimInput({ killmail: 'https://zkillboard.com/kill/5/', note: 'x'.repeat(501) })
    );
  });
});

describe('withinWindow', () => {
  const DAY = 86_400_000;
  it('allows a loss up to windowDays old and refuses older or future ones', () => {
    const now = 100 * DAY;
    expect(withinWindow(now - 30 * DAY, now, 30)).toBe(true);
    expect(withinWindow(now - 30 * DAY - 1, now, 30)).toBe(false);
    expect(withinWindow(now + 10 * 60_000, now, 30)).toBe(true);
    expect(withinWindow(now + DAY, now, 30)).toBe(false);
  });
});

describe('appraisalItems', () => {
  it('counts the hull, dropped plus destroyed, and nested container contents', () => {
    expect(
      appraisalItems({
        shipTypeId: 587,
        items: [
          { item_type_id: 34, quantity_dropped: 5, quantity_destroyed: 3 },
          { item_type_id: 34, quantity_destroyed: 2 },
          {
            item_type_id: 99,
            quantity_destroyed: 1,
            items: [{ item_type_id: 35, quantity_dropped: 1 }],
          },
        ],
      })
    ).toEqual(
      new Map([
        [587, 1],
        [34, 10],
        [99, 1],
        [35, 1],
      ])
    );
  });
});

describe('pricingInput', () => {
  const settings = {
    killmailPct: 80,
    appraisalPct: 60,
    hullRules: [
      { scope: 'hull' as const, id: 587, kind: 'pay-fixed' as const, iskAmount: 5_000_000 },
      { scope: 'class' as const, id: 25, kind: 'pay-percent' as const, pct: 50 },
      { scope: 'class' as const, id: 27, kind: 'not-covered' as const },
    ],
  };
  const values = { killmailValue: 10_000_000, appraisalValue: null };

  it('maps a fixed hull rule', () => {
    const input = pricingInput(settings, 587, 25, values);
    expect(priceSrpClaim(input)).toMatchObject({ kind: 'amount', isk: 5_000_000 });
  });
  it('a pay-percent rule replaces the corp percents', () => {
    const input = pricingInput(settings, 588, 25, values);
    expect(priceSrpClaim(input)).toMatchObject({
      kind: 'amount',
      isk: 5_000_000,
      basis: { step: 'killmail-percent', percent: 50 },
    });
  });
  it('a not-covered class refuses', () => {
    expect(priceSrpClaim(pricingInput(settings, 600, 27, values))).toEqual({
      kind: 'refused',
      reason: 'not-covered',
    });
  });
  it('no rule falls to the corp percent', () => {
    expect(priceSrpClaim(pricingInput(settings, 600, 30, values))).toMatchObject({
      kind: 'amount',
      isk: 8_000_000,
    });
  });
});

describe('srpPricing mirror', () => {
  it('matches src/engine/srpPricing.ts', () => {
    const body = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const mirror = body('./srpPricing.ts').split('\n').slice(2).join('\n');
    expect(mirror).toBe(body('../../src/engine/srpPricing.ts'));
  });
});
