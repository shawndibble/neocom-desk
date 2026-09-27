import { describe, expect, it } from 'vitest';
import { haulingHubDefaults, pickHaulingHub } from './haulingHubs';

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
