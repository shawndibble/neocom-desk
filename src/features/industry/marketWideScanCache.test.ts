import { beforeEach, describe, expect, it } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { HUB_PRICE_TTL_MS } from '@/market/prices';
import {
  clearMarketWideScanCache,
  marketWideScanKey,
  readMarketWideScan,
  writeMarketWideScan,
  type MarketWideScanInputs,
} from './marketWideScanCache';

const inputs: MarketWideScanInputs = {
  hubId: 'jita',
  tiers: new Set(['t1', 't2']),
  categories: new Set(['ships']),
  sources: new Set(['owned']),
  characterIds: [2, 1],
  assumedMe: 0,
  assumedTe: 0,
  research: [
    { blueprintTypeID: 10, me: 10, te: 20 },
    { blueprintTypeID: 11, me: 0, te: 0 },
  ],
  modifiers: NO_CHARACTER_MODIFIERS,
  standing: undefined,
  facilityDefaults: { facility: 'npcStation' },
  lpValue: 0,
  planSettings: null,
};

describe('marketWideScanKey', () => {
  it('is the same for the same inputs in another order', () => {
    expect(
      marketWideScanKey({
        ...inputs,
        tiers: new Set(['t2', 't1']),
        characterIds: [1, 2],
        research: [...inputs.research].reverse(),
      })
    ).toBe(marketWideScanKey(inputs));
  });

  it.each([
    ['hub', { hubId: 'amarr' }],
    ['tiers', { tiers: new Set(['t1']) }],
    ['categories', { categories: new Set(['ships', 'modules']) }],
    ['sources', { sources: new Set(['npc']) }],
    ['characters', { characterIds: [1] }],
    ['assumed ME', { assumedMe: 5 }],
    ['assumed TE', { assumedTe: 10 }],
    ['owned research', { research: [{ blueprintTypeID: 10, me: 9, te: 20 }] }],
    ['modifiers', { modifiers: { ...NO_CHARACTER_MODIFIERS, manufacturingTimeImplantPct: 4 } }],
    ['standing', { standing: { factionStanding: 5, corpStanding: 0 } }],
    ['remembered build location', { facilityDefaults: { facility: 'raitaru' } }],
    ['LP Value', { lpValue: 1500 }],
    ['latest plan price basis', { planSettings: { materialPriceBasis: 'buy' } }],
  ] as [string, Partial<MarketWideScanInputs>][])('changes when the %s changes', (_name, patch) => {
    expect(marketWideScanKey({ ...inputs, ...patch })).not.toBe(marketWideScanKey(inputs));
  });
});

describe('the scan cache', () => {
  beforeEach(() => clearMarketWideScanCache());
  const entry = { rows: [], fetchedAt: 1_000, unavailableSources: [] };

  it('serves a scan written under the same key while it is fresh', () => {
    writeMarketWideScan('k', entry);
    expect(readMarketWideScan('k', 1_000 + HUB_PRICE_TTL_MS - 1)).toEqual(entry);
  });

  it('never serves a scan under another key', () => {
    writeMarketWideScan('k', entry);
    expect(readMarketWideScan('other', 1_001)).toBeUndefined();
  });

  it('never serves a scan past the price TTL, and drops it', () => {
    writeMarketWideScan('k', entry);
    expect(readMarketWideScan('k', 1_000 + HUB_PRICE_TTL_MS)).toBeUndefined();
    expect(readMarketWideScan('k', 1_001)).toBeUndefined();
  });
});
