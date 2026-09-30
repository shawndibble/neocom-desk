import { describe, expect, it } from 'vitest';
import { expandHaulingLane, haulingHubDefaults, pickHaulingHub } from './haulingHubs';

describe('haulingHubDefaults', () => {
  it('keeps the original Jita to Amarr lane for a Jita pilot', () => {
    expect(haulingHubDefaults('jita')).toEqual({ from: 'jita', to: 'amarr' });
  });

  it('starts from the default Trade Hub and heads for Jita', () => {
    expect(haulingHubDefaults('dodixie')).toEqual({ from: 'dodixie', to: 'jita' });
  });

  it('never picks the same hub at both ends', () => {
    expect(haulingHubDefaults('amarr')).toEqual({ from: 'amarr', to: 'jita' });
  });
});

describe('pickHaulingHub', () => {
  it('changes just the end that was picked', () => {
    expect(pickHaulingHub({ from: 'jita', to: 'amarr' }, 'to', 'rens')).toEqual({ to: 'rens' });
  });

  it('swaps the lane when the pick is the hub the other end holds', () => {
    expect(pickHaulingHub({ from: 'amarr', to: 'jita' }, 'from', 'jita')).toEqual({
      from: 'jita',
      to: 'amarr',
    });
    expect(pickHaulingHub({ from: 'jita', to: 'amarr' }, 'to', 'jita')).toEqual({
      to: 'jita',
      from: 'amarr',
    });
  });
});

describe('pickHaulingHub, Any hub', () => {
  it('sets one end to Any', () => {
    expect(pickHaulingHub({ from: 'jita', to: 'amarr' }, 'from', 'any')).toEqual({ from: 'any' });
  });

  it('never leaves both ends on Any: picking it where the other end holds it swaps', () => {
    expect(pickHaulingHub({ from: 'any', to: 'amarr' }, 'to', 'any')).toEqual({
      to: 'any',
      from: 'amarr',
    });
  });
});

describe('expandHaulingLane', () => {
  const ids = (lanes: ReturnType<typeof expandHaulingLane>) =>
    lanes.map((l) => `${l.from.id}>${l.to.id}`);

  it('is the one lane when both ends are hubs', () => {
    expect(ids(expandHaulingLane('jita', 'amarr'))).toEqual(['jita>amarr']);
  });

  it('fans Any out to every other hub', () => {
    expect(ids(expandHaulingLane('any', 'jita'))).toEqual([
      'amarr>jita',
      'dodixie>jita',
      'rens>jita',
      'hek>jita',
    ]);
    expect(ids(expandHaulingLane('jita', 'any'))).toEqual([
      'jita>amarr',
      'jita>dodixie',
      'jita>rens',
      'jita>hek',
    ]);
  });

  it('has no lane for one hub at both ends, or Any at both', () => {
    expect(expandHaulingLane('jita', 'jita')).toEqual([]);
    expect(expandHaulingLane('any', 'any')).toEqual([]);
  });
});
