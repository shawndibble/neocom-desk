import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import { loadClosestHub, useClosestHubs } from './closestHub';

const here = vi.hoisted(() => ({
  systemId: null as number | null,
  jumps: new Map<number, number>(),
}));
vi.mock('@/features/route/currentSystem', () => ({
  loadCurrentSystemId: vi.fn(async () => here.systemId),
}));
vi.mock('@/features/route/jumpBasis', () => ({
  loadJumpBasis: vi.fn(async () => ({ rules: {}, network: {} })),
}));
vi.mock('@/features/route/localRoute', () => ({
  localJumpDistances: vi.fn(async () => ({ kind: 'known', jumps: here.jumps })),
}));

const system = (id: 'jita' | 'amarr' | 'hek') => getTradeHub(id)!.systemId;

beforeEach(() => {
  useClosestHubs.setState({ byCharacter: {} });
  here.systemId = null;
  here.jumps = new Map();
});

describe('loadClosestHub', () => {
  it('is the hub fewest jumps from where the Character is', async () => {
    here.systemId = 30000001;
    here.jumps = new Map([
      [system('jita'), 12],
      [system('amarr'), 4],
      [system('hek'), 9],
    ]);
    expect(await loadClosestHub(91)).toBe('amarr');
  });

  it('is null with no location, so the page falls back to Global', async () => {
    expect(await loadClosestHub(91)).toBeNull();
  });

  it('keeps the answer for a few minutes, so readers on screen share it', async () => {
    here.systemId = 30000001;
    here.jumps = new Map([[system('hek'), 2]]);
    expect(await loadClosestHub(91)).toBe('hek');
    here.jumps = new Map([[system('jita'), 1]]);
    expect(await loadClosestHub(91)).toBe('hek');
  });
});
