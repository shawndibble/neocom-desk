import { describe, it, expect } from 'vitest';
import { piPlanHref } from './piPlanLink';

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
