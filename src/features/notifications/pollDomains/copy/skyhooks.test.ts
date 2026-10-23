import { describe, it, expect } from 'vitest';
import type { SkyhookRaidableFire } from '@/engine/notificationDiffs';
import { skyhookRaidableCopy } from './skyhooks';

const soon: SkyhookRaidableFire = {
  eventId: 'skyhookRaidable',
  characterId: 1,
  skyhookId: 5,
  planetId: 40_000_001,
  windowStartMs: 10,
  windowEndMs: 20,
  thresholdMs: 2 * 3_600_000,
  unsecuredUnits: 500,
  phase: 'soon',
};

describe('skyhookRaidableCopy', () => {
  it('reads the live lead-time warning and the opening', () => {
    expect(skyhookRaidableCopy.poll(soon, 'Kestrel', { planet: 'X-7OMU IV' }).body).toBe(
      'Your skyhook at X-7OMU IV becomes raidable in about 2 hours.'
    );
    const now = skyhookRaidableCopy.poll({ ...soon, phase: 'danger' }, 'Kestrel', {
      planet: 'X-7OMU IV',
    });
    expect(now.title).toBe('Skyhook raidable now');
    expect(now.body).toBe('Your skyhook at X-7OMU IV is raidable now.');
  });

  it('hedges the push, falling back to the planet id', () => {
    const push = skyhookRaidableCopy.push({ ...soon, phase: 'open' }, 'Kestrel', {});
    expect(push.title).toMatch(/due/);
    expect(push.body).toContain('#40000001');
    expect(push.body).toMatch(/was due/);
  });
});
