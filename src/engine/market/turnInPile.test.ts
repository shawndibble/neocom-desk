import { describe, expect, it } from 'vitest';
import type { TurnInOffer } from './turnIn';
import { groupTurnInPile, type TurnInPileItem } from './turnInPile';

function offer(overrides: Partial<TurnInOffer>): TurnInOffer {
  return {
    objectiveId: 'obj-report',
    campaignId: 'camp-caldari',
    typeId: 97545,
    iskPerItem: 28_000,
    iskPerInterval: 28_000,
    iskInterval: 1,
    lpPerItem: 40,
    lpPerBlock: 4_000,
    lpBlockSize: 100,
    lpCorporationId: 1000035,
    lpValue: 800,
    lpIskPerItem: 32_000,
    totalPerItem: 60_000,
    traderTypeId: 97622,
    traderName: 'Secure Strength Trader',
    systemId: 30045324,
    progress: 1_700_000,
    targetProgress: 10_000_000,
    filled: 0.17,
    remaining: 8_300_000,
    maxPerParticipant: null,
    ...overrides,
  };
}

const report = offer({});
const intel = offer({
  objectiveId: 'obj-intel',
  typeId: 97549,
  iskPerItem: 32_000,
  iskPerInterval: 32_000,
  lpPerItem: 20,
  lpPerBlock: 2_000,
  lpIskPerItem: 16_000,
  totalPerItem: 48_000,
});
const signal = offer({
  objectiveId: 'obj-signal',
  campaignId: 'camp-minmatar',
  typeId: 97547,
  traderTypeId: 97623,
  traderName: 'Trail of Silence Trader',
  systemId: 30002537,
});

const item = (
  name: string,
  quantity: number,
  o: TurnInOffer,
  contributed?: number
): TurnInPileItem<TurnInOffer> => ({ name, quantity, offer: o, contributed });

describe('groupTurnInPile', () => {
  it('groups items by Item Trader and system, with a subtotal each and a total', () => {
    const pile = groupTurnInPile([
      item('Stereo-Collapse Signal', 200, signal),
      item('Shield Failover Report', 300, report),
      item('Federation Strategic Intel', 200, intel),
    ]);
    expect(pile.groups.map((g) => [g.traderName, g.systemId])).toEqual([
      ['Secure Strength Trader', 30045324],
      ['Trail of Silence Trader', 30002537],
    ]);
    expect(pile.groups[0]!.lines.map((l) => [l.name, l.reward.total])).toEqual([
      ['Shield Failover Report', 18_000_000],
      ['Federation Strategic Intel', 9_600_000],
    ]);
    expect(pile.groups[0]!.subtotal).toBe(27_600_000);
    expect(pile.groups[1]!.subtotal).toBe(12_000_000);
    expect(pile.total).toBe(39_600_000);
  });

  it('puts the group paying most first, and each group its biggest line first', () => {
    const pile = groupTurnInPile([
      item('Federation Strategic Intel', 10, intel),
      item('Stereo-Collapse Signal', 500, signal),
      item('Shield Failover Report', 100, report),
    ]);
    expect(pile.groups[0]!.traderName).toBe('Trail of Silence Trader');
    expect(pile.groups[1]!.lines.map((l) => l.name)).toEqual([
      'Shield Failover Report',
      'Federation Strategic Intel',
    ]);
  });

  it("counts only what the objective and the Character's cap still take", () => {
    const capped = offer({ maxPerParticipant: 250 });
    const pile = groupTurnInPile([item('Shield Failover Report', 300, capped, 100)]);
    expect(pile.groups[0]!.lines[0]!.reward.quantity).toBe(150);
    expect(pile.groups[0]!.lines[0]!.quantity).toBe(300);
  });

  it('leaves out an item nothing more is paid for, and a group left empty', () => {
    const full = offer({ maxPerParticipant: 100 });
    const pile = groupTurnInPile([
      item('Shield Failover Report', 50, full, 100),
      item('Stereo-Collapse Signal', 0, signal),
    ]);
    expect(pile.groups).toEqual([]);
    expect(pile.total).toBe(0);
  });

  it('keeps two traders apart even when they share a system', () => {
    const other = offer({ objectiveId: 'obj-x', typeId: 1, traderTypeId: 1, traderName: 'X' });
    const pile = groupTurnInPile([item('A', 1, report), item('B', 1, other)]);
    expect(pile.groups).toHaveLength(2);
  });
});
