import { describe, expect, it } from 'vitest';
import { LANDING_ANCHORS, landingAnchor } from './landingAnchors';

describe('landingAnchor', () => {
  it('numbers a section by its header link position, two digits, with its label key', () => {
    expect(landingAnchor(LANDING_ANCHORS[0].id)).toEqual({
      index: '01',
      key: LANDING_ANCHORS[0].key,
    });
    expect(landingAnchor('login-faq').index).toBe(String(LANDING_ANCHORS.length).padStart(2, '0'));
  });

  it('throws on a section with no anchor, so a band cannot ship unnumbered', () => {
    expect(() => landingAnchor('login-nowhere')).toThrow(/login-nowhere/);
  });
});
