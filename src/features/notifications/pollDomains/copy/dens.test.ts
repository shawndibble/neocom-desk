import { describe, it, expect } from 'vitest';
import type { MercenaryDenReinforcedFire } from '@/engine/notificationDiffs';
import { mercenaryDenAnarchyCopy, mercenaryDenReinforcedCopy } from './dens';

const soon: MercenaryDenReinforcedFire = {
  eventId: 'mercenaryDenReinforced',
  characterId: 1,
  denId: 5,
  planetId: 40_000_001,
  reinforcedUntilMs: 10,
  thresholdMs: 3_600_000,
  phase: 'soon',
};

describe('mercenaryDenReinforcedCopy', () => {
  it('reads the live warning and the exit', () => {
    expect(mercenaryDenReinforcedCopy.poll(soon, 'Kestrel', { planet: 'Efa III' }).body).toBe(
      "Kestrel's Mercenary Den on Efa III comes out of reinforcement in about 1 hour."
    );
    expect(
      mercenaryDenReinforcedCopy.poll({ ...soon, phase: 'out' }, 'Kestrel', { planet: 'Efa III' })
        .title
    ).toBe('Den out of reinforcement');
  });

  it('hedges the push, falling back to the planet id', () => {
    const push = mercenaryDenReinforcedCopy.push({ ...soon, phase: 'out' }, 'Kestrel', {});
    expect(push.title).toMatch(/due/);
    expect(push.body).toContain('#40000001');
    expect(push.body).toMatch(/was due/);
  });
});

describe('mercenaryDenAnarchyCopy', () => {
  it('names the planet and the anarchy reached', () => {
    const body = mercenaryDenAnarchyCopy.poll(
      {
        eventId: 'mercenaryDenAnarchy',
        characterId: 1,
        denId: 5,
        planetId: 40_000_001,
        anarchyAmount: 55.4,
        thresholdPct: 50,
      },
      'Kestrel',
      { planet: 'Efa III' }
    ).body;
    expect(body).toBe("Kestrel's Mercenary Den on Efa III has reached 55% anarchy.");
  });
});
