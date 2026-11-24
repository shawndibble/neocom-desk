// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import type { MilitaryCampaignsFile } from '@/sde/types';
import { renderHook, waitFor } from '@testing-library/react';
import {
  loadMilitaryCampaignsOverview,
  loadParticipation,
  loadTurnInOffers,
  useTurnInOffersByHub,
} from './useTurnIns';

const mocks = vi.hoisted(() => ({
  file: vi.fn(),
  state: vi.fn(),
  joined: vi.fn(),
  rates: vi.fn(),
}));

vi.mock('@/sde/loadSde', () => ({ loadMilitaryCampaigns: mocks.file }));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () =>
    new Map([[30045324, { id: 30045324, name: 'Onnamon', security: 0.3, regionId: 1 }]]),
}));
vi.mock('@/features/loyalty/lpRates', () => ({ loadLpRates: mocks.rates }));
vi.mock('./campaignData', () => ({
  loadCampaignState: mocks.state,
  loadJoinedObjectives: mocks.joined,
}));

const FILE: MilitaryCampaignsFile = {
  traderSystemSource: 'test',
  campaigns: [{ id: 'camp', title: 'Secure Strength', factionId: 500001, targetProgress: 4 }],
  objectives: [
    {
      id: 'report',
      campaignId: 'camp',
      title: 'Deliver Shield Failover Report in Onnamon',
      method: 'ItemTraded',
      targetProgress: 10_000_000,
      isk: { amount: 28_000, interval: 1 },
      lp: { amount: 4_000, interval: 100, corporationId: 1000035 },
      turnIn: {
        typeId: 97545,
        traderTypeId: 97622,
        traderName: 'Secure Strength Trader',
        systemId: 30045324,
      },
    },
    { id: 'mine', campaignId: 'camp', title: 'Mine ore', method: 'MineOre', targetProgress: 100 },
  ],
};

const STATE = {
  campaigns: [{ id: 'camp', state: 'Active', progress: 1 }],
  objectivesById: new Map([
    ['report', { state: 'Active', progress: 1_000_000 }],
    ['mine', { state: 'Active', progress: 50 }],
  ]),
  fetchedAt: new Date('2026-11-23T12:00:00Z'),
  fromCache: false,
};

const jita = TRADE_HUBS.find((hub) => hub.id === 'jita')!;

describe('loadTurnInOffers', () => {
  beforeEach(() => {
    mocks.file.mockReset().mockResolvedValue(FILE);
    mocks.state.mockReset().mockResolvedValue(STATE);
    mocks.rates.mockReset().mockResolvedValue(() => ({ rate: 1_000, source: 'market' }));
  });

  it('answers per type: reward per item, LP as ISK, Item Trader, system, % filled, block, objective', async () => {
    const offers = await loadTurnInOffers(jita);
    expect(offers.offerFor(97545)).toMatchObject({
      objectiveId: 'report',
      objectiveTitle: 'Deliver Shield Failover Report in Onnamon',
      campaignTitle: 'Secure Strength',
      factionId: 500001,
      iskPerItem: 28_000,
      lpPerItem: 40,
      lpIskPerItem: 40_000,
      totalPerItem: 68_000,
      lpBlockSize: 100,
      lpValueSource: 'market',
      traderName: 'Secure Strength Trader',
      systemId: 30045324,
      systemName: 'Onnamon',
      filled: 0.1,
    });
    expect(offers.offerFor(34)).toBeNull();
    expect(mocks.rates).toHaveBeenCalledWith([1000035], jita);
  });

  it('prices the LP of every Active turn-in, so LP can decide which objective wins an item', async () => {
    const report = FILE.objectives[0]!;
    const lpRich = {
      ...report,
      id: 'lp-rich',
      isk: { amount: 1, interval: 1 },
      lp: { amount: 100_000, interval: 100, corporationId: 1000180 },
    };
    mocks.file.mockResolvedValue({ ...FILE, objectives: [...FILE.objectives, lpRich] });
    mocks.state.mockResolvedValue({
      ...STATE,
      objectivesById: new Map([
        ...STATE.objectivesById,
        ['lp-rich', { state: 'Active', progress: 0 }],
      ]),
    });
    const offers = await loadTurnInOffers(jita);
    expect(mocks.rates).toHaveBeenCalledWith([1000035, 1000180], jita);
    expect(offers.offerFor(97545)?.objectiveId).toBe('lp-rich');
  });

  it('throws when the live state cannot be read: no offers is not "no campaign"', async () => {
    mocks.state.mockResolvedValue(null);
    await expect(loadTurnInOffers(jita)).rejects.toThrow();
  });
});

describe('useTurnInOffersByHub', () => {
  beforeEach(() => {
    mocks.file.mockReset().mockResolvedValue(FILE);
    mocks.state.mockReset().mockResolvedValue(STATE);
    mocks.rates
      .mockReset()
      .mockImplementation(async (_corporations: number[], hub: { id: string }) => () => ({
        rate: hub.id === 'jita' ? 1_000 : 500,
        source: 'market',
      }));
  });

  it("answers each hub's offers, LP at that hub's LP Value", async () => {
    const amarr = TRADE_HUBS.find((hub) => hub.id === 'amarr')!;
    const { result } = renderHook(() => useTurnInOffersByHub([jita, amarr]));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.get('jita')?.offerFor(97545)?.lpIskPerItem).toBe(40_000);
    expect(result.current.data?.get('amarr')?.offerFor(97545)?.lpIskPerItem).toBe(20_000);
  });

  it('stays idle for no hub', () => {
    const { result } = renderHook(() => useTurnInOffersByHub([]));
    expect(result.current.status).toBe('idle');
  });
});

describe('loadParticipation', () => {
  it('answers unknown for every objective without the Permission', async () => {
    mocks.joined.mockResolvedValue({ kind: 'needsPermission' });
    const participation = await loadParticipation(7);
    expect(participation.stateOf('report')).toBe('unknown');
  });

  it('answers participating or not from the read', async () => {
    mocks.joined.mockResolvedValue({
      kind: 'ok',
      joined: new Map([
        ['report', { id: 'report', campaignId: 'camp', committed: true, contributed: 5 }],
      ]),
      fetchedAt: new Date(),
      fromCache: false,
    });
    const participation = await loadParticipation(7);
    expect(participation.stateOf('report')).toBe('participating');
    expect(participation.stateOf('mine')).toBe('notParticipating');
    expect(participation.contributedTo('report')).toBe(5);
    expect(participation.contributedTo('mine')).toBeNull();
  });
});

describe('loadMilitaryCampaignsOverview', () => {
  beforeEach(() => {
    mocks.file.mockReset().mockResolvedValue(FILE);
    mocks.state.mockReset().mockResolvedValue(STATE);
  });

  it('lists the objectives the Character Participates in and each campaign’s completion', async () => {
    mocks.joined.mockResolvedValue({
      kind: 'ok',
      joined: new Map([
        ['mine', { id: 'mine', campaignId: 'camp', committed: true, contributed: 9 }],
      ]),
      fetchedAt: new Date(),
      fromCache: false,
    });
    const overview = await loadMilitaryCampaignsOverview(7);
    expect(overview.participating?.map((row) => [row.objective.id, row.contributed])).toEqual([
      ['mine', 9],
    ]);
    expect(overview.campaigns).toMatchObject([{ campaignId: 'camp', completed: 1, target: 4 }]);
  });

  it('has no participating list without the Permission, but still the campaigns', async () => {
    mocks.joined.mockResolvedValue({ kind: 'needsPermission' });
    const overview = await loadMilitaryCampaignsOverview(7);
    expect(overview.participating).toBeNull();
    expect(overview.campaigns).toHaveLength(1);
  });
});
