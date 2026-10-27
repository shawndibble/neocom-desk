import { describe, expect, it } from 'vitest';
import type { AnsiblexGate } from '@/engine/route/ansiblex';
import type { TheraConnection } from '@/engine/route/theraConnections';
import {
  bridgeEndsFromKey,
  bridgeKey,
  holeEndsFromKey,
  holeNetworkKey,
  pinsFromKey,
  pinsKey,
} from './routeSafetyKeys';

const NOW = Date.parse('2026-10-03T09:00:00Z');
const HOUR = 3_600_000;

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
    expiresAt: NOW + 10 * HOUR,
    ...overrides,
  };
}

describe('holeNetworkKey', () => {
  it('names the network, not the list: order, duplicates and life do not change it', () => {
    const a = [hole({ exitSystemId: 2 }), hole({ exitSystemId: 1, hub: 'turnur' })];
    const b = [
      hole({ exitSystemId: 1, hub: 'turnur', expiresAt: NOW + HOUR }),
      hole({ exitSystemId: 2 }),
      hole({ id: 'twin', exitSystemId: 2 }),
    ];
    expect(holeNetworkKey(a)).toBe(holeNetworkKey(b));
    expect(holeNetworkKey([])).toBe('');
  });

  it('round-trips to the same ends', () => {
    const holes = [hole({ exitSystemId: 2 }), hole({ exitSystemId: 1, hub: 'turnur' })];
    expect(holeEndsFromKey(holeNetworkKey(holes))).toEqual([
      { exitSystemId: 1, hub: 'turnur' },
      { exitSystemId: 2, hub: 'thera' },
    ]);
    expect(holeEndsFromKey('')).toEqual([]);
  });
});

describe('bridgeKey', () => {
  const AD: AnsiblexGate = { fromId: 30000001, toId: 30000004, name: 'A » D' };

  it('is the same for the same pairs in any order, and empty for none', () => {
    const other: AnsiblexGate = { fromId: 30000005, toId: 30000002, name: 'x' };
    expect(bridgeKey([AD, other])).toBe(bridgeKey([other, { ...AD, name: 'renamed' }]));
    expect(bridgeKey([])).toBe('');
  });

  it('gives back the pairs it was made from, unnamed', () => {
    expect(bridgeEndsFromKey(bridgeKey([AD]))).toEqual([
      { fromId: 30000001, toId: 30000004, name: '' },
    ]);
    expect(bridgeEndsFromKey('')).toEqual([]);
  });
});

describe('pinsKey', () => {
  const open = hole({ id: 'abc', exitSystemId: 7 });
  const listed = new Map([[open.id, open]]);

  it('names a pinned hole by its ends, so it changes only when the hole closes', () => {
    const key = pinsKey(['abc', '', 'gates', 'gone', 'thera', 'ansiblex'], listed);
    expect(key).toBe(
      pinsKey(
        ['abc', '', 'gates', 'gone', 'thera', 'ansiblex'],
        new Map([['abc', { ...open, expiresAt: NOW + HOUR }]])
      )
    );
    expect(pinsFromKey(key)).toEqual({
      tokens: ['abc', '', 'gates', 'gone', 'thera', 'ansiblex'],
      listed: [{ id: 'abc', exitSystemId: 7, hub: 'thera' }],
    });
  });

  it('waits on the list for a hole or hub pin while there is none', () => {
    const key = pinsKey(['abc', 'gates'], null);
    expect(key).not.toBe(pinsKey(['abc', 'gates'], listed));
    expect(pinsFromKey(key)).toEqual({ tokens: ['abc', 'gates'], listed: null });
  });

  it('drops a token that names nothing', () => {
    expect(pinsFromKey(pinsKey(['not a pin!', 'gates'], listed))).toEqual({
      tokens: ['', 'gates'],
      listed: [],
    });
    expect(pinsFromKey('')).toEqual({ tokens: [], listed: [] });
  });
});
