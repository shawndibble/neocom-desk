import { describe, expect, it } from 'vitest';
import { haulingHubDefaults } from './haulingHubs';

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
