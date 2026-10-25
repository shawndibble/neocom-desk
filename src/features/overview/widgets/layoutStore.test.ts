import { describe, expect, it } from 'vitest';
import { OVERVIEW_LAYOUT_KEY, parseLayout } from './layoutStore';
import { MAX_WIDGETS } from './layout';

const good = (over: Record<string, unknown> = {}) => ({
  id: 'a',
  kind: 'orders',
  size: 'M',
  view: 'chart',
  scope: 'header',
  showOnPhone: true,
  ...over,
});
const wrap = (...widgets: unknown[]) => ({ version: 1, widgets });

describe('parseLayout', () => {
  it('uses the synced key', () => {
    expect(OVERVIEW_LAYOUT_KEY).toBe('sync.overviewLayout');
  });

  it('round-trips a valid layout unchanged', () => {
    const raw = wrap(good(), good({ id: 'b', kind: 'wallet', range: 7, title: 'Mine' }));
    expect(parseLayout(raw)).toEqual(raw);
  });

  it("keeps a Market Trend widget's picks and a year, and strips them from other kinds", () => {
    const picks = { trendItems: [34, 35], trendHubs: ['jita', 'amarr'] };
    const [trend, wallet] = parseLayout(
      wrap(
        good({ id: 'a', kind: 'marketTrend', range: 365, ...picks }),
        good({ id: 'b', kind: 'wallet', range: 365, ...picks })
      )
    )!.widgets;
    expect(trend).toMatchObject({ range: 365, ...picks });
    expect(wallet.range).toBe(30);
    expect(wallet).not.toHaveProperty('trendItems');
    expect(wallet).not.toHaveProperty('trendHubs');
  });

  it('drops a Market Trend pick that is not a known id', () => {
    const [trend] = parseLayout(
      wrap(good({ id: 'a', kind: 'marketTrend', trendItems: ['x'], trendHubs: ['nowhere'] }))
    )!.widgets;
    expect(trend).not.toHaveProperty('trendItems');
    expect(trend).not.toHaveProperty('trendHubs');
  });

  it('returns null for garbage', () => {
    for (const raw of [null, undefined, 'x', 3, [], {}, { version: 1 }, { widgets: 'no' }]) {
      expect(parseLayout(raw)).toBeNull();
    }
  });

  it('accepts an empty widget list (the pilot removed everything)', () => {
    expect(parseLayout(wrap())).toEqual(wrap());
  });

  it('drops entries that are not widgets', () => {
    const out = parseLayout(
      wrap(good(), 3, null, { kind: 'orders' }, { id: 'x' }, { id: 5, kind: 'a' })
    );
    expect(out!.widgets.map((w) => w.id)).toEqual(['a']);
  });

  it('keeps a kind this build does not know, untouched, with its extra fields', () => {
    const future = { id: 'f', kind: 'quantumMail', size: 'XL', view: 'hologram', extra: { a: 1 } };
    const out = parseLayout(wrap(good(), future));
    expect(out!.widgets[1]).toEqual(future);
  });

  it('keeps unknown extra fields on a known widget', () => {
    const out = parseLayout(wrap(good({ pinColor: 'red' })));
    expect(out!.widgets[0]).toMatchObject({ pinColor: 'red' });
  });

  it('keeps unknown top-level fields', () => {
    const out = parseLayout({ version: 1, widgets: [], futureThing: 7 });
    expect((out as unknown as Record<string, unknown>).futureThing).toBe(7);
  });

  it('repairs an invalid size or view to the kind default', () => {
    const out = parseLayout(wrap(good({ size: 'XXL', view: 'hologram' })));
    expect(out!.widgets[0]).toMatchObject({ size: 'L', view: 'table' });
  });

  it('repairs a view the kind does not have', () => {
    const out = parseLayout(wrap(good({ kind: 'sp', size: 'S', view: 'chart' })));
    expect(out!.widgets[0].view).toBe('number');
  });

  it('reads a stored list view as the table it was renamed to', () => {
    const out = parseLayout(wrap(good({ view: 'list' })));
    expect(out!.widgets[0].view).toBe('table');
  });

  it('keeps a stored view even when the kind now defaults to another', () => {
    // Orders defaults to Table now; a pilot who chose Number keeps it.
    const out = parseLayout(wrap(good({ view: 'number' })));
    expect(out!.widgets[0].view).toBe('number');
  });

  it('repairs scope, showOnPhone, range and title', () => {
    const out = parseLayout(
      wrap(good({ kind: 'wallet', scope: 'everyone', showOnPhone: 'yes', range: 12, title: 4 }))
    );
    const w = out!.widgets[0];
    expect(w.scope).toBe('header');
    expect(w.showOnPhone).toBe(true);
    expect(w.range).toBe(30);
    expect('title' in w).toBe(false);
  });

  it('drops a range from a kind that has none', () => {
    const out = parseLayout(wrap(good({ kind: 'orders', range: 12 })));
    expect('range' in out!.widgets[0]).toBe(false);
  });

  it('keeps a valid Omega plan and drops one that is not, or on a kind with no plan', () => {
    const plan = (over: Record<string, unknown>) =>
      parseLayout(wrap(good({ kind: 'omega', view: 'chart', ...over })))!.widgets[0];
    expect(plan({ plexPer30Days: 1200 }).plexPer30Days).toBe(1200);
    expect('plexPer30Days' in plan({ plexPer30Days: -3 })).toBe(false);
    expect('plexPer30Days' in plan({ plexPer30Days: '500' })).toBe(false);
    expect('plexPer30Days' in parseLayout(wrap(good({ plexPer30Days: 600 })))!.widgets[0]).toBe(
      false
    );
  });

  it('keeps the Skyhook raids Where and radius, drops bad ones and other kinds', () => {
    const raids = (over: Record<string, unknown>) =>
      parseLayout(wrap(good({ kind: 'sovRaids', ...over })))!.widgets[0];
    const kept = raids({ raidsWhere: 'near', raidsRadius: 15 });
    expect(kept.raidsWhere).toBe('near');
    expect(kept.raidsRadius).toBe(15);
    expect('raidsWhere' in raids({ raidsWhere: 'everywhere' })).toBe(false);
    expect('raidsRadius' in raids({ raidsRadius: 7 })).toBe(false);
    expect('raidsRadius' in raids({ raidsRadius: 8 })).toBe(false);
    // An old layout with neither field loads unchanged.
    const old = raids({});
    expect('raidsWhere' in old || 'raidsRadius' in old).toBe(false);
    expect('raidsWhere' in parseLayout(wrap(good({ raidsWhere: 'near' })))!.widgets[0]).toBe(false);
  });

  it("keeps Structures' Problems only and drops a bad value or one on another kind", () => {
    const structures = (over: Record<string, unknown>) =>
      parseLayout(wrap(good({ kind: 'structures', ...over })))!.widgets[0];
    expect(structures({ structuresShow: 'problems' }).structuresShow).toBe('problems');
    expect('structuresShow' in structures({ structuresShow: 'all' })).toBe(false);
    expect('structuresShow' in structures({ structuresShow: 'broken' })).toBe(false);
    expect(
      'structuresShow' in parseLayout(wrap(good({ structuresShow: 'problems' })))!.widgets[0]
    ).toBe(false);
  });

  it('reads a retired Offline services widget as Structures on Problems only, in place', () => {
    const out = parseLayout(
      wrap(
        good({ id: 'a', kind: 'wallet', view: 'number' }),
        good({ id: 's', kind: 'corpServices', size: 'L', view: 'number', title: 'Down' }),
        good({ id: 'c', kind: 'corpMembers', view: 'table' })
      )
    )!;
    expect(out.widgets.map((w) => w.id)).toEqual(['a', 's', 'c']);
    expect(out.widgets[1]).toMatchObject({
      id: 's',
      kind: 'structures',
      size: 'L',
      view: 'number',
      title: 'Down',
      structuresShow: 'problems',
    });
  });

  it('keeps a valid rowsPerPage and drops one that is not offered', () => {
    expect(parseLayout(wrap(good({ rowsPerPage: 25 })))!.widgets[0].rowsPerPage).toBe(25);
    expect('rowsPerPage' in parseLayout(wrap(good({ rowsPerPage: 7 })))!.widgets[0]).toBe(false);
    expect('rowsPerPage' in parseLayout(wrap(good({ rowsPerPage: '10' })))!.widgets[0]).toBe(false);
  });

  it('dedupes ids, keeping the first', () => {
    const out = parseLayout(wrap(good({ id: 'a' }), good({ id: 'a', kind: 'wallet' })));
    expect(out!.widgets).toHaveLength(1);
    expect(out!.widgets[0].kind).toBe('orders');
  });

  it('keeps a synced layout longer than the soft limit; only adding is capped', () => {
    const many = Array.from({ length: MAX_WIDGETS + 8 }, (_, i) => good({ id: `i${i}` }));
    expect(parseLayout(wrap(...many))!.widgets).toHaveLength(MAX_WIDGETS + 8);
  });
});
