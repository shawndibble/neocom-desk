import { describe, it, expect, vi } from 'vitest';
import { onEsiActivity, emitEsiActivity, type ActivityEvent } from './activityLog';

const EVENT: ActivityEvent = {
  endpointId: 'getCharacterSkills',
  characterId: 123,
  timestamp: 1_000,
  outcome: 'success',
};

describe('onEsiActivity / emitEsiActivity', () => {
  it('delivers an emitted event to a subscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = onEsiActivity(listener);

    emitEsiActivity(EVENT);

    expect(listener).toHaveBeenCalledWith(EVENT);
    unsubscribe();
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onEsiActivity(listener);
    unsubscribe();

    emitEsiActivity(EVENT);

    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener does not stop other listeners from being notified', () => {
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const other = vi.fn();
    const unsubscribeThrowing = onEsiActivity(throwing);
    const unsubscribeOther = onEsiActivity(other);

    expect(() => emitEsiActivity(EVENT)).not.toThrow();
    expect(other).toHaveBeenCalledWith(EVENT);
    unsubscribeThrowing();
    unsubscribeOther();
  });

  it('the signal delivers an ActivityEvent unchanged (the leak canary in client.test.ts exercises the real leak surface)', () => {
    const listener = vi.fn();
    const unsubscribe = onEsiActivity(listener);

    emitEsiActivity({
      endpointId: 'getCharacterWallet',
      characterId: 456,
      timestamp: 2_000,
      outcome: 'error',
    });

    const received = listener.mock.calls[0][0] as ActivityEvent;
    expect(Object.keys(received).sort()).toEqual(
      ['characterId', 'endpointId', 'outcome', 'timestamp'].sort()
    );
    unsubscribe();
  });
});
