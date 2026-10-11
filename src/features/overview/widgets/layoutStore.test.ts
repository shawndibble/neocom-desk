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
    expect(out!.widgets[0]).toMatchObject({ size: 'M', view: 'number' });
  });

  it('repairs a view the kind does not have', () => {
    const out = parseLayout(wrap(good({ kind: 'sp', size: 'S', view: 'chart' })));
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
