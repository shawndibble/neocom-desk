import { describe, it, expect } from 'vitest';
import {
  parsePiProduct,
  piColonyHref,
  piPlanHref,
  hrefWithout,
  hrefWithoutPiPlanet,
  hrefWithoutPiProduct,
  MAP_ONLY_PARAMS,
  parsePiPlanet,
  piPlanetHref,
  piProductHref,
  productNavigation,
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
    expect(
      piProductHref(2393, '?product=9832&type=9848&colony=4&info=character-1&planet=7&q=x')
    ).toBe('/planetary-industry/map?q=x&product=2393');
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

describe('hrefWithoutPiProduct', () => {
  it('drops only the product', () => {
    const at = (search: string) => ({ pathname: '/planetary-industry/map', search, hash: '' });
    expect(hrefWithoutPiProduct(at('?goals=1&product=2393'))).toBe(
      '/planetary-industry/map?goals=1'
    );
    expect(hrefWithoutPiProduct(at('?product=2393'))).toBe('/planetary-industry/map');
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

describe('planet drawer addressing', () => {
  it('links the Map with the colony open', () => {
    expect(piPlanetHref(40000001)).toBe('/planetary-industry/map?planet=40000001');
  });

  it('parses a positive whole id and nothing else', () => {
    expect(parsePiPlanet('?planet=40000001')).toBe(40000001);
    expect(parsePiPlanet('')).toBeNull();
    expect(parsePiPlanet('?planet=abc')).toBeNull();
    expect(parsePiPlanet('?planet=0')).toBeNull();
    expect(parsePiPlanet('?planet=-4')).toBeNull();
  });

  it('drops only planet from a location', () => {
    expect(
      hrefWithoutPiPlanet({
        pathname: '/planetary-industry/map',
        search: '?planet=4&off=2',
        hash: '#x',
      })
    ).toBe('/planetary-industry/map?off=2#x');
    expect(
      hrefWithoutPiPlanet({ pathname: '/planetary-industry/map', search: '?planet=4', hash: '' })
    ).toBe('/planetary-industry/map');
  });

  it('drops both Map-only params, keeping the rest', () => {
    expect(
      hrefWithout(
        { pathname: '/planetary-industry/plan', search: '?planet=4&product=9832&off=2', hash: '' },
        MAP_ONLY_PARAMS
      )
    ).toBe('/planetary-industry/plan?off=2');
    expect(
      hrefWithout(
        { pathname: '/planetary-industry/plan', search: '?planet=4', hash: '#customs' },
        MAP_ONLY_PARAMS
      )
    ).toBe('/planetary-industry/plan#customs');
  });
});
