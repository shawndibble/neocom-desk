import { describe, it, expect } from 'vitest';
import { bakeMilitaryCampaigns, traderSystemId } from './militaryCampaigns.mjs';

const itemTraded = (traded, trader) => ({
  name: 'ItemTraded',
  parameters: [
    {
      key: 'traded_item',
      matcher: { values: [{ valueType: 'item_type', values: [String(traded)] }] },
    },
    { key: 'trader', matcher: { values: [{ valueType: 'item_type', values: [String(trader)] }] } },
  ],
});

const objective = (over = {}) => ({
  _key: 'obj-1',
  campaignID: 'camp-1',
  title: { en: 'Deliver Shield Failover Report in Onnamon', de: 'x' },
  subtitle: {
    en: 'Recover <url=showinfo:97545>Shield Failover Report</url> then trade it at the Item Trader in <url=showinfo:5//30045324>Onnamon</url>.',
  },
  contributionMethodConfiguration: itemTraded(97545, 97622),
  issuer: { corporationID: 1000035 },
  maxProgressPerParticipant: 10000000,
  rewards: {
    isk: { amountPerInterval: 28000, issuer: { corporationID: 1000035 }, progressInterval: 1 },
    lp: { amountPerInterval: 4000, issuer: { corporationID: 1000035 }, progressInterval: 100 },
  },
  targetProgress: 10000000,
  ...over,
});

const campaign = {
  _key: 'camp-1',
  title: { en: 'Secure Strength' },
  issuer: { factionID: 500001 },
  targetProgress: 4,
};

const types = [{ _key: 97622, name: { en: 'Secure Strength Trader' } }];

describe('traderSystemId', () => {
  it('reads the one solar system the subtitle links', () => {
    expect(traderSystemId('in <url=showinfo:5//30045324>Onnamon</url>.')).toBe(30045324);
  });

  it('is null when no system, or two different ones, are linked', () => {
    expect(traderSystemId('no link here')).toBeNull();
    expect(traderSystemId('showinfo:5//30000142 and showinfo:5//30002187')).toBeNull();
    expect(traderSystemId(undefined)).toBeNull();
  });
});

describe('bakeMilitaryCampaigns', () => {
  it('keeps a turn-in objective with its rewards, Item Trader and system', () => {
    const baked = bakeMilitaryCampaigns([objective()], [campaign], types);
    expect(baked.campaigns).toEqual([
      { id: 'camp-1', title: 'Secure Strength', factionId: 500001, targetProgress: 4 },
    ]);
    expect(baked.objectives).toEqual([
      {
        id: 'obj-1',
        campaignId: 'camp-1',
        title: 'Deliver Shield Failover Report in Onnamon',
        method: 'ItemTraded',
        targetProgress: 10000000,
        maxPerParticipant: 10000000,
        isk: { amount: 28000, interval: 1 },
        lp: { amount: 4000, interval: 100, corporationId: 1000035 },
        turnIn: {
          typeId: 97545,
          traderTypeId: 97622,
          traderName: 'Secure Strength Trader',
          systemId: 30045324,
        },
      },
    ]);
    expect(baked.traderSystemSource).toMatch(/subtitle/);
  });

  it('keeps every other objective type too, with no turnIn', () => {
    const mining = objective({
      _key: 'obj-2',
      title: { en: 'Mine ore' },
      contributionMethodConfiguration: { name: 'MineOre', parameters: [] },
      rewards: { isk: { amountPerInterval: 30, progressInterval: 1 } },
    });
    const [row] = bakeMilitaryCampaigns([mining], [campaign], types).objectives;
    expect(row.method).toBe('MineOre');
    expect(row.turnIn).toBeUndefined();
    expect(row.lp).toBeUndefined();
    expect(row.isk).toEqual({ amount: 30, interval: 1 });
  });

  it('reads the sde.evetech.net id keys as well as the zip export ones', () => {
    const { _key, ...rest } = objective();
    const baked = bakeMilitaryCampaigns(
      [{ ...rest, objectiveID: _key }],
      [{ ...campaign, _key: undefined, campaignID: 'camp-1' }],
      types
    );
    expect(baked.objectives[0].id).toBe('obj-1');
    expect(baked.campaigns[0].id).toBe('camp-1');
  });

  it('sorts by id so a rebake of the same data is byte-identical', () => {
    const baked = bakeMilitaryCampaigns(
      [objective({ _key: 'b' }), objective({ _key: 'a' })],
      [campaign],
      types
    );
    expect(baked.objectives.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('throws on a turn-in objective it cannot read rather than baking a half row', () => {
    const broken = objective({
      contributionMethodConfiguration: { name: 'ItemTraded', parameters: [] },
    });
    expect(() => bakeMilitaryCampaigns([broken], [campaign], types)).toThrow(/obj-1/);
  });
});
