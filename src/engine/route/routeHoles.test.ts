import { describe, expect, it } from 'vitest';
import { holeBetween, holeNetwork, routeHoles, type RouteHoleSettings } from './routeHoles';
import { HUB_SYSTEM_IDS, type TheraConnection } from './theraConnections';

const NOW = Date.parse('2026-10-03T09:00:00Z');
const HOUR = 3_600_000;
const THERA = HUB_SYSTEM_IDS.thera;
const TURNUR = HUB_SYSTEM_IDS.turnur;

function hole(overrides: Partial<TheraConnection> = {}): TheraConnection {
  return {
    id: '1',
    hub: 'thera',
    hubSignature: 'ABC-123',
    exitSignature: 'EPK-530',
    exitSystemId: 30002676,
    exitSystemName: 'Kihtaled',
    exitClass: 'hs',
    exitRegionName: 'Heimatar',
    wormholeType: 'Q063',
    maxShipSize: 'medium',
    expiresAt: NOW + 5 * HOUR,
    ...overrides,
  };
}

const SETTINGS: RouteHoleSettings = { hubs: 'all', shipSize: 'medium', minLifeHours: 1 };

describe('routeHoles', () => {
  it('keeps holes the ship fits through: this size or bigger', () => {
    const holes = [
      hole({ id: 'small', maxShipSize: 'small' }),
      hole({ id: 'medium', maxShipSize: 'medium' }),
      hole({ id: 'xlarge', maxShipSize: 'xlarge' }),
      hole({ id: 'unknown', maxShipSize: null }),
    ];
    expect(routeHoles(holes, SETTINGS, NOW).map((h) => h.id)).toEqual(['medium', 'xlarge']);
  });

  it('skips holes with under the minimum life left', () => {
    const holes = [
      hole({ id: 'short', expiresAt: NOW + HOUR - 1 }),
      hole({ id: 'exact', expiresAt: NOW + HOUR }),
      hole({ id: 'gone', expiresAt: NOW - 1 }),
    ];
    expect(routeHoles(holes, SETTINGS, NOW).map((h) => h.id)).toEqual(['exact']);
    expect(routeHoles(holes, { ...SETTINGS, minLifeHours: 0 }, NOW).map((h) => h.id)).toEqual([
      'short',
      'exact',
    ]);
  });

  it('keeps only the chosen hub, or both', () => {
    const holes = [hole({ id: 't', hub: 'thera' }), hole({ id: 'u', hub: 'turnur' })];
    expect(routeHoles(holes, { ...SETTINGS, hubs: 'thera' }, NOW).map((h) => h.id)).toEqual(['t']);
    expect(routeHoles(holes, { ...SETTINGS, hubs: 'turnur' }, NOW).map((h) => h.id)).toEqual(['u']);
    expect(routeHoles(holes, SETTINGS, NOW).map((h) => h.id)).toEqual(['t', 'u']);
  });
});

describe('holeNetwork', () => {
  it('joins each exit to its hub, and frees only hubs a hole leads to', () => {
    const network = holeNetwork([
      hole({ exitSystemId: 1 }),
      hole({ exitSystemId: 2, hub: 'thera' }),
    ]);
    expect(network.extraConnections).toEqual([
      [1, THERA],
      [2, THERA],
    ]);
    expect([...network.freeSystems]).toEqual([THERA]);
  });

  it('is empty with no holes, so the gate route is untouched', () => {
    expect(holeNetwork([])).toEqual({ extraConnections: [], freeSystems: new Set() });
  });
});

describe('holeBetween', () => {
  const holes = [
    hole({ id: 'a', exitSystemId: 1, expiresAt: NOW + 3 * HOUR }),
    hole({ id: 'b', exitSystemId: 1, expiresAt: NOW + 9 * HOUR }),
    hole({ id: 'u', hub: 'turnur', exitSystemId: 2 }),
  ];

  it('finds the hole a step crosses, either way round, longest-lived first', () => {
    expect(holeBetween(holes, 1, THERA)?.id).toBe('b');
    expect(holeBetween(holes, THERA, 1)?.id).toBe('b');
    expect(holeBetween(holes, TURNUR, 2)?.id).toBe('u');
  });

  it('finds nothing for a step no hole joins', () => {
    expect(holeBetween(holes, 1, TURNUR)).toBeNull();
    expect(holeBetween(holes, 1, 2)).toBeNull();
  });
});
