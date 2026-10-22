import { describe, expect, it } from 'vitest';
import { returnPathAfterSwitch } from './characterSwitchReturn';

describe('returnPathAfterSwitch', () => {
  it('falls back to Overview with no origin, or when the origin is Characters itself', () => {
    expect(returnPathAfterSwitch(undefined)).toBe('/overview');
    expect(returnPathAfterSwitch('')).toBe('/overview');
    expect(returnPathAfterSwitch('/characters')).toBe('/overview');
    expect(returnPathAfterSwitch('/characters?view=table')).toBe('/overview');
  });

  it('returns to the origin page with its filters, sort and tab intact', () => {
    expect(returnPathAfterSwitch('/skills/trained')).toBe('/skills/trained');
    expect(returnPathAfterSwitch('/market?q=tritanium&sort=price')).toBe(
      '/market?q=tritanium&sort=price'
    );
    expect(returnPathAfterSwitch('/contacts/across#top')).toBe('/contacts/across#top');
  });

  it("drops a viewed-Character id, which would keep showing the previous pick's data", () => {
    expect(returnPathAfterSwitch('/wallet?char=2112&page=2')).toBe('/wallet?page=2');
    expect(returnPathAfterSwitch('/assets/items?chars=2112')).toBe('/assets/items');
  });

  it("keeps Assets' current/all Character filter keywords, which re-resolve", () => {
    expect(returnPathAfterSwitch('/assets/items?chars=all')).toBe('/assets/items?chars=all');
    expect(returnPathAfterSwitch('/assets/items?chars=current')).toBe(
      '/assets/items?chars=current'
    );
  });

  it("collapses an Assets drill-down, whose station and containers are the previous Character's", () => {
    expect(returnPathAfterSwitch('/assets/items/60003760/1029384756?q=ore')).toBe(
      '/assets/items?q=ore'
    );
  });
});
