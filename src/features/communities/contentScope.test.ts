import { describe, expect, it } from 'vitest';
import { parseContentScopes } from './contentScope';

describe('parseContentScopes', () => {
  it('keeps each tab’s stored pick', () => {
    expect(parseContentScopes({ blueprints: 'mine', fittings: 'everyone', plans: 'mine' })).toEqual(
      { blueprints: 'mine', fittings: 'everyone', plans: 'mine' }
    );
  });

  it('falls back to Everyone for a tab it cannot read', () => {
    expect(parseContentScopes({ fittings: 'mine', plans: 'sideways' })).toEqual({
      blueprints: 'everyone',
      fittings: 'mine',
      plans: 'everyone',
    });
  });

  it('rejects a stored value that is not a record', () => {
    expect(parseContentScopes('mine')).toBeNull();
    expect(parseContentScopes(null)).toBeNull();
  });
});
