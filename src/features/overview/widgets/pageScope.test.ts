import { describe, expect, it } from 'vitest';
import {
  corpScope,
  setAllScopes,
  type OverviewLayout,
  type Widget,
  type WidgetScope,
} from './layout';
import { pageScope } from './pageScope';

const widget = (id: string, kind: string, scope: WidgetScope): Widget => ({
  id,
  kind,
  size: 'M',
  view: 'number',
  scope,
  showOnPhone: true,
});

const SUMS = new Set(['a', 'b']);
const sums = (w: Widget) => SUMS.has(w.kind);
const read = (w: Widget) => w.scope;

describe('pageScope', () => {
  it('is the scope every widget shares', () => {
    expect(pageScope([widget('1', 'a', 'all'), widget('2', 'b', 'all')], read, sums)).toBe('all');
    expect(pageScope([widget('1', 'a', 'header')], read, sums)).toBe('header');
  });

  it('is Mixed when widgets differ', () => {
    expect(pageScope([widget('1', 'a', 'all'), widget('2', 'b', 'header')], read, sums)).toBe(
      'mixed'
    );
    expect(
      pageScope([widget('1', 'a', corpScope(5)), widget('2', 'b', corpScope(6))], read, sums)
    ).toBe('mixed');
  });

  it('does not count a widget that cannot sum while another can', () => {
    expect(pageScope([widget('1', 'a', 'all'), widget('2', 'x', 'header')], read, sums)).toBe(
      'all'
    );
  });

  it('counts every widget when none can sum, and reads an empty board as All', () => {
    expect(pageScope([widget('1', 'x', 'header')], read, sums)).toBe('header');
    expect(pageScope([], read, sums)).toBe('all');
  });
});

describe('setAllScopes', () => {
  const layout: OverviewLayout = {
    version: 1,
    widgets: [widget('1', 'a', 'header'), widget('2', 'x', 'header'), widget('3', 'b', 'all')],
  };

  it('puts every widget on the scope', () => {
    const next = setAllScopes(layout, corpScope(9));
    expect(next.widgets.map((w) => w.scope)).toEqual(['corp:9', 'corp:9', 'corp:9']);
  });

  it('leaves out a widget the caller says cannot take it', () => {
    const next = setAllScopes(layout, 'all', sums);
    expect(next.widgets.map((w) => w.scope)).toEqual(['all', 'header', 'all']);
  });

  it('returns the same layout when nothing changes', () => {
    expect(setAllScopes(layout, 'header', () => false)).toBe(layout);
  });
});
