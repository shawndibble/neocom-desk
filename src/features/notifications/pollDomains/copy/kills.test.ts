import { describe, it, expect } from 'vitest';
import type { ShipLostFire } from '@/engine/notificationDiffs';
import { shipLostCopy } from './kills';

const fire: ShipLostFire = {
  eventId: 'shipLost',
  characterId: 1,
  killmailId: 9,
  timeMs: 0,
  shipTypeId: 587,
  systemId: 30000142,
  value: 12_400_000,
};

describe('shipLostCopy', () => {
  it('names the ship, system and value', () => {
    expect(shipLostCopy.poll(fire, 'Kestrel', { ship: 'Rifter', system: 'Tama' })).toEqual({
      title: 'Ship lost',
      body: 'Lost your Rifter in Tama · 12.4M ISK',
    });
  });

  it('falls back to ids, and leaves out what the loss lacks', () => {
    expect(shipLostCopy.poll(fire, 'Kestrel', {}).body).toBe(
      'Lost your #587 in #30000142 · 12.4M ISK'
    );
    const bare: ShipLostFire = { eventId: 'shipLost', characterId: 1, killmailId: 9, timeMs: 0 };
    expect(shipLostCopy.poll(bare, 'Kestrel', {}).body).toBe('Lost a ship');
  });
});
