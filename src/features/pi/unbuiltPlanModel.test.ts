import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { AssumedRate } from './richnessEstimate';
import { medianNewLinkLoad, unbuiltPlanAdvice, type UnbuiltPlanInput } from './unbuiltPlanModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
const AQUEOUS_LIQUIDS = 2268;
const BACTERIA = 2393;
const WATER = 2389;
const TEST_CULTURES = 2319;

const PRICES: Record<number, number> = {
  [MICROORGANISMS]: 5,
  [AQUEOUS_LIQUIDS]: 5,
  2287: 5,
  2288: 5,
  2305: 5,
  [BACTERIA]: 1_000,
  [WATER]: 1_000,
  3645: 1_000,
  [TEST_CULTURES]: 100_000,
};

const RATE: AssumedRate = {
  kind: 'measured-own-colonies',
  unitsPerHour: 6_000,
  sampleSize: 4,
};

function input(overrides: Partial<UnbuiltPlanInput> = {}): UnbuiltPlanInput {
  return {
    planetType: 'temperate',
    picked: [MICROORGANISMS],
    pi,
    ceiling: { level: 5, assumed: false, budget: { cpu: 25_415, powergrid: 19_000 } },
    rate: RATE,
    assumedLinkCost: { cpu: 180, powergrid: 130 },
    prices: PRICES,
    taxRate: 0.1,
    ...overrides,
  };
}

describe('medianNewLinkLoad', () => {
  it('takes the middle hop as one coherent pair, not each axis separately', () => {
    // Sorted by CPU the middle colony is the 180/130 one; its own Powergrid
    // rides along, because a link's two axes both scale with the same
    // distance and mixing them would describe a hop no colony has.
    expect(
      medianNewLinkLoad([
        { cpu: 900, powergrid: 40 },
        { cpu: 180, powergrid: 130 },
        { cpu: 30, powergrid: 700 },
      ])
    ).toEqual({ cpu: 180, powergrid: 130 });
  });

  it('refuses rather than inventing a hop when no colony could be measured', () => {
    expect(medianNewLinkLoad([])).toBeNull();
  });
});

describe('unbuiltPlanAdvice', () => {
  it('says nothing until the pilot has picked what they would pull', () => {
    // The planet's own resource list is not a stand-in for the pick: scoring
    // over all of them would put a chain the pilot never said they would
    // extract on the card as an instruction.
    expect(unbuiltPlanAdvice(input({ picked: [] })).status).toBe('needs-pick');
  });

  it('refuses without a rate of the pilot’s own to project from', () => {
    expect(unbuiltPlanAdvice(input({ rate: { kind: 'no-measured-extraction' } })).status).toBe(
      'needs-measured-extraction'
    );
  });

  it('refuses when no colony of the pilot’s could supply a link cost', () => {
    // Every pin of a fitted layout is charged a link. With no hop to borrow,
    // the fit would charge nothing for links and overstate what fits — the
    // exact failure #440 was filed about.
    expect(unbuiltPlanAdvice(input({ assumedLinkCost: null })).status).toBe('needs-link-cost');
  });

  it('refuses off an assumed Command Center ceiling', () => {
    // Same rule the slot count and the header chip follow: an assumed figure
    // may be shown, never acted on. Untrained is one level, and fitting
    // against it would tell a pilot at Command Center Upgrades V that nothing
    // fits here.
    expect(
      unbuiltPlanAdvice(
        input({ ceiling: { level: 0, assumed: true, budget: { cpu: 1_675, powergrid: 6_000 } } })
      ).status
    ).toBe('needs-skill');
  });

  it('scores only over what the pilot picked', () => {
    // Microorganisms alone closes Bacteria and nothing above it: Test
    // Cultures needs Water too, and the pilot has not said they would pull
    // Aqueous Liquids here.
    const result = unbuiltPlanAdvice(input({ picked: [MICROORGANISMS] }));
    expect(result.status).toBe('advised');
    if (result.status !== 'advised') return;
    expect(result.advice.kind).toBe('recommended');
    if (result.advice.kind !== 'recommended') return;
    expect(result.advice.best.typeId).not.toBe(TEST_CULTURES);
    expect([MICROORGANISMS, BACTERIA]).toContain(result.advice.best.typeId);
  });

  it('reaches a higher tier once the pilot picks the second input', () => {
    // The whole point of the picker. Test Cultures needs Bacteria and Water,
    // so its P0 set only closes once both resources are ticked — asserted on
    // the candidate set rather than the winner, because which candidate wins
    // is a pricing question and this is a reachability one.
    const scored = (picked: number[]) => {
      const result = unbuiltPlanAdvice(input({ picked }));
      if (result.status !== 'advised') throw new Error(`expected advice, got ${result.status}`);
      return result.advice.entries.map((entry) => entry.typeId);
    };
    expect(scored([MICROORGANISMS])).not.toContain(TEST_CULTURES);
    expect(scored([MICROORGANISMS, AQUEOUS_LIQUIDS])).toContain(TEST_CULTURES);
  });

  it('drops a picked resource this planet type does not actually yield', () => {
    // Picks are durable and planet types change between patches, so the
    // planet's own resource list stays the authority over a stale pick.
    const result = unbuiltPlanAdvice(input({ picked: [MICROORGANISMS, 34] }));
    expect(result.status).toBe('advised');
    if (result.status !== 'advised') return;
    expect(result.advice.kind).toBe('recommended');
  });

  it('charges the borrowed hop against the budget rather than fitting links free', () => {
    // The guard this module exists for. A hop dear enough to price every
    // layout out has to reach the verdict; if links were fitted at zero the
    // same budget would still host a colony.
    const advise = (assumedLinkCost: { cpu: number; powergrid: number }) => {
      const result = unbuiltPlanAdvice(input({ picked: [MICROORGANISMS], assumedLinkCost }));
      if (result.status !== 'advised') throw new Error(`expected advice, got ${result.status}`);
      return result.advice;
    };
    expect(advise({ cpu: 10, powergrid: 10 }).kind).toBe('recommended');

    const dear = advise({ cpu: 25_000, powergrid: 18_000 });
    expect(dear.kind).toBe('no-recommendation');
    if (dear.kind !== 'no-recommendation') return;
    expect(dear.blocker).toBe('does-not-fit');
  });
});
