import { describe, expect, it } from 'vitest';
import { preferenceCards, type PreferenceRoute } from './routePreferenceCards';
import type { RouteSafetySummary } from './routeSafety';

const summary = (over: Partial<RouteSafetySummary> = {}): RouteSafetySummary => ({
  jumps: 14,
  highsec: 14,
  lowsec: 0,
  nullsec: 0,
  lowestSecurity: 0.5,
  shipKills: 13,
  podKills: 0,
  chokepoints: [],
  ...over,
});

const route = (systemIds: number[], over: Partial<RouteSafetySummary> = {}): PreferenceRoute => ({
  systemIds,
  securities: systemIds.map(() => 0.9),
  summary: summary({ jumps: systemIds.length - 1, ...over }),
});

describe('preferenceCards', () => {
  it('lists the preferences in the order given, marking only the active one', () => {
    const cards = preferenceCards(
      {
        'prefer-highsec': route([1, 2, 3, 4]),
        shortest: route([1, 5, 4]),
        'avoid-highsec': route([1, 6, 4]),
      },
      ['prefer-highsec', 'shortest', 'avoid-highsec'],
      'shortest'
    );
    expect(cards.map((card) => card.preference)).toEqual([
      'prefer-highsec',
      'shortest',
      'avoid-highsec',
    ]);
    expect(cards.map((card) => card.active)).toEqual([false, true, false]);
  });

  it('carries each route summary through untouched', () => {
    const [card] = preferenceCards(
      { shortest: route([1, 2], { lowestSecurity: 0.3, shipKills: null, podKills: null }) },
      ['shortest'],
      'shortest'
    );
    expect(card?.summary).toMatchObject({ jumps: 1, lowestSecurity: 0.3, shipKills: null });
  });

  it('names the earlier preference a card shares its exact route with', () => {
    const cards = preferenceCards(
      {
        'prefer-highsec': route([1, 2, 3]),
        shortest: route([1, 2, 3]),
        'avoid-highsec': route([1, 9, 3]),
      },
      ['prefer-highsec', 'shortest', 'avoid-highsec'],
      'shortest'
    );
    expect(cards.map((card) => card.sameRouteAs)).toEqual([null, 'prefer-highsec', null]);
  });

  it('leaves a preference with no answer yet as an empty card', () => {
    const cards = preferenceCards(
      { shortest: route([1, 2]) },
      ['prefer-highsec', 'shortest'],
      'shortest'
    );
    expect(cards[0]).toEqual({
      preference: 'prefer-highsec',
      active: false,
      summary: null,
      securities: [],
      kills: null,
      sameRouteAs: null,
    });
  });

  it('never matches an unanswered card against another unanswered one', () => {
    const cards = preferenceCards({}, ['prefer-highsec', 'shortest'], 'shortest');
    expect(cards.map((card) => card.sameRouteAs)).toEqual([null, null]);
  });

  it('totals ship and pod kills, and keeps an unknown total unknown rather than 0', () => {
    const cards = preferenceCards(
      {
        'prefer-highsec': route([1, 2], { shipKills: 5, podKills: 2 }),
        shortest: route([1, 2], { shipKills: null, podKills: null }),
      },
      ['prefer-highsec', 'shortest'],
      'shortest'
    );
    expect(cards.map((card) => card.kills)).toEqual([7, null]);
  });
});
