import { describe, expect, it } from 'vitest';
import { bpcSourcingParams } from './bpcSourcingUrl';

describe('bpcSourcingParams', () => {
  it('opens with the toggles the pilot set as their defaults', () => {
    const params = bpcSourcingParams({ hideAuctions: true, hidePlex: false });
    expect(params['sourcing.hideAuctions'].parse(null)).toBe(true);
    expect(params['sourcing.hidePlex'].parse(null)).toBe(false);
  });

  it('lets the URL switch a default off for one view, and writes only the difference', () => {
    const { 'sourcing.hideAuctions': hideAuctions } = bpcSourcingParams({
      hideAuctions: true,
      hidePlex: false,
    });
    expect(hideAuctions.parse('0')).toBe(false);
    expect(hideAuctions.serialize(false)).toBe('0');
    expect(hideAuctions.serialize(true)).toBeNull();
  });
});
