import { describe, expect, it } from 'vitest';
import type { CampaignObjectiveEntry } from '@/sde/types';
import { activeTurnInOffers, turnInOffer, turnInReward, type ObjectiveLive } from './turnIn';

const report: CampaignObjectiveEntry = {
  id: 'obj-report',
  campaignId: 'camp-caldari',
  title: 'Deliver Shield Failover Report in Onnamon',
  method: 'ItemTraded',
  targetProgress: 10_000_000,
  maxPerParticipant: 10_000_000,
  isk: { amount: 28_000, interval: 1 },
  lp: { amount: 4_000, interval: 100, corporationId: 1000035 },
  turnIn: {
    typeId: 97545,
    traderTypeId: 97622,
    traderName: 'Secure Strength Trader',
    systemId: 30045324,
  },
};

const active = (progress = 2_500_000): ObjectiveLive => ({ state: 'Active', progress });
const live = (entries: [string, ObjectiveLive][]) => new Map(entries);
const lpAt = (rate: number | null) => () => rate;

describe('turnInOffer', () => {
  it('prices one item as its ISK plus its share of a block of LP at the LP Value', () => {
    const offer = turnInOffer(report, active(), lpAt(1_000));
    expect(offer).toMatchObject({
      objectiveId: 'obj-report',
      campaignId: 'camp-caldari',
      typeId: 97545,
      iskPerItem: 28_000,
      lpPerItem: 40,
      lpPerBlock: 4_000,
      lpBlockSize: 100,
      lpCorporationId: 1000035,
      lpValue: 1_000,
      lpIskPerItem: 40_000,
      totalPerItem: 68_000,
      traderTypeId: 97622,
      traderName: 'Secure Strength Trader',
      systemId: 30045324,
      progress: 2_500_000,
      targetProgress: 10_000_000,
      remaining: 7_500_000,
    });
    expect(offer?.filled).toBeCloseTo(0.25);
  });

  it('leaves the LP unpriced, never free, when nothing gives the corporation an LP Value', () => {
    const offer = turnInOffer(report, active(), lpAt(null));
    expect(offer?.lpValue).toBeNull();
    expect(offer?.lpIskPerItem).toBeNull();
    expect(offer?.lpPerItem).toBe(40);
    expect(offer?.totalPerItem).toBe(28_000);
  });

  it('treats a zero or broken LP Value as unpriced', () => {
    expect(turnInOffer(report, active(), lpAt(0))?.lpIskPerItem).toBeNull();
    expect(turnInOffer(report, active(), lpAt(Number.NaN))?.lpIskPerItem).toBeNull();
  });

  it('asks the LP Value of the corporation that pays the LP', () => {
    const asked: number[] = [];
    turnInOffer(report, active(), (corporationId) => {
      asked.push(corporationId);
      return 500;
    });
    expect(asked).toEqual([1000035]);
  });

  it('offers nothing for an objective that is not Active', () => {
    for (const state of ['Completed', 'Expired', 'Unspecified'] as const) {
      expect(turnInOffer(report, { state, progress: 10 }, lpAt(1_000))).toBeNull();
    }
  });

  it('offers nothing once the community target is filled, whatever the state says', () => {
    expect(turnInOffer(report, active(10_000_000), lpAt(1_000))).toBeNull();
  });

  it('offers nothing without live state: only an objective ESI says is Active pays', () => {
    expect(turnInOffer(report, undefined, lpAt(1_000))).toBeNull();
  });

  it('offers nothing for an objective that is not a turn-in', () => {
    const mining = { ...report, method: 'MineOre', turnIn: undefined };
    expect(turnInOffer(mining, active(), lpAt(1_000))).toBeNull();
  });

  it('pays ISK alone when the objective pays no LP', () => {
    const iskOnly = { ...report, lp: undefined };
    const offer = turnInOffer(iskOnly, active(), lpAt(1_000));
    expect(offer).toMatchObject({
      lpPerItem: 0,
      lpPerBlock: 0,
      lpBlockSize: null,
      lpCorporationId: null,
      lpIskPerItem: 0,
      totalPerItem: 28_000,
    });
  });

  it('spreads ISK paid per interval over the items in it (ore paid per unit)', () => {
    const ore = {
      ...report,
      isk: { amount: 270, interval: 1 },
      lp: { ...report.lp!, interval: 10_000 },
    };
    const offer = turnInOffer(ore, active(), lpAt(1_000));
    expect(offer?.iskPerItem).toBe(270);
    expect(offer?.lpPerItem).toBeCloseTo(0.4);
    expect(offer?.lpBlockSize).toBe(10_000);
  });
});

describe('activeTurnInOffers', () => {
  it('keys the Active turn-in offers by the item turned in', () => {
    const offers = activeTurnInOffers([report], live([['obj-report', active()]]), lpAt(1_000));
    expect([...offers.keys()]).toEqual([97545]);
  });

  it('keeps the better-paying objective when two take the same item', () => {
    const better = { ...report, id: 'obj-better', isk: { amount: 50_000, interval: 1 } };
    const offers = activeTurnInOffers(
      [report, better],
      live([
        ['obj-report', active()],
        ['obj-better', active()],
      ]),
      lpAt(1_000)
    );
    expect(offers.get(97545)?.objectiveId).toBe('obj-better');
  });

  it('drops filled and closed objectives', () => {
    const offers = activeTurnInOffers(
      [report],
      live([['obj-report', { state: 'Completed', progress: 10_000_000 }]]),
      lpAt(1_000)
    );
    expect(offers.size).toBe(0);
  });
});

describe('turnInReward', () => {
  const offer = turnInOffer(report, active(), lpAt(1_000))!;

  it('pays ISK per item and LP only for each full block', () => {
    expect(turnInReward(offer, 250)).toEqual({
      quantity: 250,
      isk: 7_000_000,
      lp: 8_000,
      lpIsk: 8_000_000,
      total: 15_000_000,
      outsideBlock: 50,
    });
  });

  it('pays no LP below one block', () => {
    expect(turnInReward(offer, 99)).toMatchObject({ lp: 0, lpIsk: 0, outsideBlock: 99 });
  });

  it('counts no more than the objective still needs', () => {
    const nearlyFull = turnInOffer(report, active(9_999_950), lpAt(1_000))!;
    expect(turnInReward(nearlyFull, 200)).toMatchObject({ quantity: 50, isk: 1_400_000, lp: 0 });
  });

  it("counts no more than the Character's own cap allows, given what it has contributed", () => {
    expect(turnInReward(offer, 500, 9_999_800)).toMatchObject({ quantity: 200, lp: 8_000 });
  });

  it('leaves the LP unpriced in the total when the offer has no LP Value', () => {
    const unpriced = turnInOffer(report, active(), lpAt(null))!;
    expect(turnInReward(unpriced, 100)).toMatchObject({
      isk: 2_800_000,
      lp: 4_000,
      lpIsk: null,
      total: 2_800_000,
    });
  });

  it('pays nothing for no items, or a nonsense count', () => {
    expect(turnInReward(offer, 0)).toMatchObject({ quantity: 0, isk: 0, lp: 0, total: 0 });
    expect(turnInReward(offer, -5)).toMatchObject({ quantity: 0, total: 0 });
    expect(turnInReward(offer, 2.7)).toMatchObject({ quantity: 2, isk: 56_000 });
  });
});
