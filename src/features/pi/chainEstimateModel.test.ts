import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { colonyBudget } from './colonyBudget';
import { buildChainEstimate, chainPlanets, type ChainBasis } from './chainEstimateModel';
import { rawInputsOf } from './productPlanets';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const COOLANT = 9832; // P2
const ROBOTICS = 9848; // P3
const NANO_FACTORY = 2869; // P4

function books(): ChainBasis['books'] {
  const book: Record<number, number> = {};
  const byTier: Record<number, number> = { 0: 5, 1: 400, 2: 8_000, 3: 60_000, 4: 1_000_000 };
  for (const raw of pi.raw) book[raw.typeID] = 5;
  for (const key of Object.keys(pi.schematics)) book[Number(key)] = byTier[piTier(Number(key), pi)];
  return { prices: book, revenuePrices: book, salesTaxPct: 4 };
}

function basis(overrides: Partial<ChainBasis> = {}): ChainBasis {
  const cc = colonyBudget(5, pi);
  return {
    ccLevel: cc.level,
    ccAssumed: false,
    budget: cc.budget,
    newLinkCost: { cpu: 25, powergrid: 18 },
    linkCost: 'borrowed',
    headsPerExtractor: 10,
    ratePerHour: 6_000,
    rateSource: 'measured',
    taxRate: 0.1,
    books: books(),
    haulDays: 7,
    ...overrides,
  };
}

const p3p4 = Object.keys(pi.schematics)
  .map(Number)
  .filter((id) => piTier(id, pi) >= 3);

describe('chainPlanets', () => {
  it('covers every raw, at most two a planet, with one planet able to host the factories', () => {
    for (const typeId of p3p4) {
      const planets = chainPlanets(typeId, pi)!;
      const covered = planets.flatMap((p) => p.raws).sort((a, b) => a - b);
      expect(covered, pi.schematics[String(typeId)].name).toEqual(rawInputsOf(typeId, pi));
      expect(planets.every((p) => p.raws.length <= 2)).toBe(true);
      const hosts = pi.schematics[String(typeId)].planetTypes;
      expect(planets.some((p) => hosts.includes(p.type))).toBe(true);
      for (const planet of planets) {
        for (const raw of planet.raws) {
          expect(pi.raw.find((r) => r.typeID === raw)!.planetTypes).toContain(planet.type);
        }
      }
    }
  });

  it('hosts a P4 on Barren or Temperate, the only types with a High-Tech Production Plant', () => {
    const planets = chainPlanets(NANO_FACTORY, pi)!;
    expect(planets.some((p) => p.type === 'barren' || p.type === 'temperate')).toBe(true);
  });
});

describe('buildChainEstimate', () => {
  it('estimates every P3 and P4 from planets the pilot would add, at their own assumptions', () => {
    for (const typeId of [ROBOTICS, NANO_FACTORY]) {
      const view = buildChainEstimate(typeId, basis(), pi);
      expect(view, pi.schematics[String(typeId)].name).not.toBeNull();
      expect(view!.iskPerDay).toBeGreaterThan(0);
      expect(view!.unitsPerDay).toBeGreaterThan(0);
      expect(view!.planets.length).toBeGreaterThanOrEqual(2);
      expect(view!.m3PerWeek).toBeGreaterThan(0);
      // A weekly hauler moves a week's load at once.
      expect(view!.m3PerHaul).toBeCloseTo(view!.m3PerWeek, 6);
      expect(view!.ccLevel).toBe(5);
    }
  });

  it('has a figure for every P3 and P4 when the market prices them', () => {
    const missing = p3p4.filter((typeId) => buildChainEstimate(typeId, basis(), pi) === null);
    expect(missing.map((id) => pi.schematics[String(id)].name)).toEqual([]);
  });

  it('scales the per-haul load to the pilot’s haul cadence', () => {
    const weekly = buildChainEstimate(ROBOTICS, basis(), pi)!;
    const daily = buildChainEstimate(ROBOTICS, basis({ haulDays: 1 }), pi)!;
    expect(daily.m3PerHaul).toBeCloseTo(weekly.m3PerWeek / 7, 6);
  });

  it('pays the pilot’s own sell market: a corp buyback at 80% earns less than the hub', () => {
    const hub = buildChainEstimate(ROBOTICS, basis(), pi)!;
    const book = books();
    const buyback = Object.fromEntries(
      Object.entries(book.revenuePrices).map(([id, price]) => [id, price * 0.8])
    );
    const atBuyback = buildChainEstimate(
      ROBOTICS,
      basis({ books: { ...book, revenuePrices: buyback, salesTaxPct: 0 } }),
      pi
    )!;
    expect(atBuyback.iskPerDay).toBeLessThan(hub.iskPerDay);
  });

  it('shows no figure when the market has no price for the product, never zero', () => {
    const book = books();
    const revenuePrices = { ...book.revenuePrices };
    delete revenuePrices[ROBOTICS];
    expect(
      buildChainEstimate(ROBOTICS, basis({ books: { ...book, revenuePrices } }), pi)
    ).toBeNull();
    expect(
      buildChainEstimate(
        ROBOTICS,
        basis({ books: { prices: {}, revenuePrices: {}, salesTaxPct: 4 } }),
        pi
      )
    ).toBeNull();
  });

  it('leaves P1 and P2 to the one-planet ranking', () => {
    expect(buildChainEstimate(COOLANT, basis(), pi)).toBeNull();
    expect(buildChainEstimate(pi.raw[0].typeID, basis(), pi)).toBeNull();
  });
});
