import { describe, it, expect } from 'vitest';
import {
  parsePiProduct,
  piColonyHref,
  piPlanHref,
  piProductHref,
  productNavigation,
  withoutPiProduct,
  PI_PRODUCT_PUSHED_STATE,
} from './piPlanLink';

describe('piPlanHref', () => {
  it('opens the planner on that type from anywhere else', () => {
    expect(piPlanHref(9832, '/industry', '?x=1')).toBe('/planetary-industry/plan?type=9832');
  });

  it('on the planner itself keeps the current plan and adds the type to it', () => {
    expect(piPlanHref(9848, '/planetary-industry/plan', '?goals=9832%3A200&off=4')).toBe(
      '/planetary-industry/plan?goals=9832%3A200&off=4&type=9848'
    );
  });
});

describe('piColonyHref', () => {
  it('opens that colony on the Colonies tab', () => {
    expect(piColonyHref(40001)).toBe('/planetary-industry/colonies?colony=40001');
  });
});

describe('piProductHref', () => {
  it("opens the Map tab with that product's drawer open", () => {
    expect(piProductHref(2393, '')).toBe('/planetary-industry/map?product=2393');
  });

  it("keeps the page's other params, so the tabs keep the plan", () => {
    expect(piProductHref(2393, '?goals=9832%3A200&off=4')).toBe(
      '/planetary-industry/map?goals=9832%3A200&off=4&product=2393'
    );
  });

  it('replaces an open product and drops a goal seed, an open colony and Show info', () => {
    expect(piProductHref(2393, '?product=9832&type=9848&colony=4&info=character-1&q=x')).toBe(
      '/planetary-industry/map?q=x&product=2393'
    );
  });
});

describe('parsePiProduct', () => {
  it('reads a positive whole type id', () => {
    expect(parsePiProduct('?product=2393')).toBe(2393);
  });

  it.each(['', '?product=', '?product=abc', '?product=-4', '?product=1.5', '?product=0'])(
    'ignores %s',
    (search) => {
      expect(parsePiProduct(search)).toBeNull();
    }
  );
});

describe('withoutPiProduct', () => {
  it('drops only the product', () => {
    expect(withoutPiProduct('?goals=1&product=2393')).toBe('?goals=1');
    expect(withoutPiProduct('?product=2393')).toBe('');
  });
});

describe('productNavigation', () => {
  const MAP = '/planetary-industry/map';
  it('pushes with no marker from Plan or Colonies, so Close stays on the Map', () => {
    expect(
      productNavigation({ pathname: '/planetary-industry/plan', search: '', state: null })
    ).toEqual({ replace: false, state: null });
  });

  it('pushes with the marker on the Map when no drawer is open', () => {
    expect(productNavigation({ pathname: MAP, search: '?goals=1', state: null })).toEqual({
      replace: false,
      state: PI_PRODUCT_PUSHED_STATE,
    });
  });

  it('replaces, keeping the entry state, when a product is already open', () => {
    expect(
      productNavigation({ pathname: MAP, search: '?product=2393', state: PI_PRODUCT_PUSHED_STATE })
    ).toEqual({ replace: true, state: PI_PRODUCT_PUSHED_STATE });
  });
});
